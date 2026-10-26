// Runs extension/worker.js in a Node sandbox, feeds it real segments and checks the remuxed output.
// Usage: node test_worker.js <worker.js> <fixture dir> [out dir]
// The fixture dir holds seg_*.ts or init.mp4 + seg_*.mp4 (see fetch_fixtures.py). For fMP4 the init
// segment is prepended to every media segment, exactly like the player does.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [workerPath, fixtureDir, outDir] = process.argv.slice(2);
const files = fs.readdirSync(fixtureDir).filter(f => /^seg_\d+\.(ts|mp4)$/.test(f)).sort();
const init = fs.existsSync(path.join(fixtureDir, 'init.mp4')) ? fs.readFileSync(path.join(fixtureDir, 'init.mp4')) : null;

const messages = [];
const sandbox = {
	navigator: {userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'},
	performance, TextDecoder, WebAssembly, console,
	fetch: async url => ({arrayBuffer: async () => {
		const b = fs.readFileSync(path.join(path.dirname(workerPath), url));
		return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
	}}),
	postMessage: msg => messages.push(structuredClone(msg))
};
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(workerPath, 'utf8'), sandbox, {filename: 'worker.js'});

function box(b, start, end) {
	const out = [];
	for (let i = start; i + 8 <= end;) {
		const size = b.readUInt32BE(i);
		if (size < 8 || i + size > end) throw new Error(`bad box at ${i}`);
		out.push({type: b.toString('latin1', i + 4, i + 8), start: i, body: i + 8, end: i + size});
		i += size;
	}
	return out;
}

// Validate a remuxed media segment: one moof (video traf + audio traf) + one mdat; walk the AVCC NALs.
function checkMedia(seg, info) {
	const b = Buffer.from(seg);
	const top = box(b, 0, b.length);
	if (top.map(x => x.type).join() !== 'moof,mdat') throw new Error('unexpected top boxes ' + top.map(x => x.type));
	const res = {};
	for (const traf of box(b, top[0].body, top[0].end).filter(x => x.type === 'traf')) {
		const kids = box(b, traf.body, traf.end);
		const track = b.readUInt32BE(kids.find(x => x.type === 'tfhd').body + 4);
		const tfdt = kids.find(x => x.type === 'tfdt');
		const dt = Number(b.readBigUInt64BE(tfdt.body + 4));
		const trun = kids.find(x => x.type === 'trun');
		const flags = b.readUIntBE(trun.body + 1, 3), n = b.readUInt32BE(trun.body + 4);
		let p = trun.body + 8, data = top[0].start + b.readInt32BE(p);
		p += 4;
		let dur = 0, keys = 0, bytes = 0, firstKey = -1;
		for (let i = 0; i < n; i++) {
			let d = 0, s, f = 0;
			if (flags & 0x100) { d = b.readUInt32BE(p); p += 4; }
			s = b.readUInt32BE(p); p += 4;
			if (flags & 0x400) { f = b.readUInt32BE(p); p += 4; }
			if (flags & 0x800) p += 4;
			if (track === 1) {
				// AVCC walk: lengths must tile the sample exactly
				let q = data;
				while (q < data + s) { const l = b.readUInt32BE(q); if (!l) throw new Error('zero NAL'); q += 4 + l; }
				if (q !== data + s) throw new Error(`NAL lengths do not tile sample ${i}`);
				if (!(f & 0x10000)) { keys++; if (firstKey < 0) firstKey = i; }
			}
			dur += d; bytes += s; data += s;
		}
		if (data > b.length) throw new Error('sample data past end');
		res[track === 1 ? 'video' : 'audio'] = {tfdt: dt, n, dur, keys, firstKey, bytes};
	}
	return res;
}

(async () => {
	await new Promise(r => setTimeout(r, 50)); // let wasm compile
	let prevVideoEnd = null, prevAudioEnd = null, sampleRate = 0;
	const parts = [];
	for (let i = 0; i < files.length; i++) {
		let data = fs.readFileSync(path.join(fixtureDir, files[i]));
		if (init) data = Buffer.concat([init, data]);
		const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.length);
		messages.length = 0;
		sandbox.self.onmessage({data: {чОбработка: 3, пДанные: ab, чДлительность: 2, лРазрыв: i === 0, чНомер: i + 1, сАдресИнициализации: ''}});
		await new Promise(r => setTimeout(r, 0));
		for (const m of messages) {
			if (m[0] === 2) m[2].forEach((s, k) => console.log(`  [${m[1][k]}] ${s}`));
			if (m[0] === 3 || m[0] === 4) { console.log('WORKER FAILED:', m[1]); process.exitCode = 1; return; }
		}
		const res = messages.find(m => m[0] === 1);
		const out = res[1].пДанные;
		if (!out.мбМедиасегмент) { console.log(`${files[i]}: REJECTED (Забраковано=${out.лЗабраковано})`); process.exitCode = 1; continue; }
		if (out.мбСегментИнициализации) {
			console.log(`${files[i]}: new init, codecs=${out.сКодеки} ${out.чШиринаКартинки}x${out.чВысотаКартинки} fps=${out.чЧастотаКадров} rate=${out.чЧастотаДискретизации} ch=${out.чКоличествоКаналов}`);
			sampleRate = out.чЧастотаДискретизации;
			parts.push(Buffer.from(out.мбСегментИнициализации));
		}
		parts.push(Buffer.from(out.мбМедиасегмент));
		const r = checkMedia(out.мбМедиасегмент);
		const v = r.video, a = r.audio;
		let line = `${files[i]}: in=${data.length}B out=${out.мбМедиасегмент.length}B`;
		if (v) line += ` | video n=${v.n} keys=${v.keys} firstKey=${v.firstKey} tfdt=${(v.tfdt / 9e4).toFixed(4)} dur=${(v.dur / 9e4).toFixed(4)}s`;
		if (a) line += ` | audio n=${a.n} tfdt=${(a.tfdt / sampleRate).toFixed(4)} dur=${(a.n * 1024 / sampleRate).toFixed(4)}s`;
		line += ` | stats bitrate=${out.чБитрейтЗвука && out.чБитрейтЗвука.toFixed(1)}kbps transc=${out.чВремяКодирования} offset=${out.чПозицияТрансляции}`;
		console.log(line);
		if (v && prevVideoEnd !== null && v.tfdt !== prevVideoEnd) console.log(`  !! video gap ${(v.tfdt - prevVideoEnd) / 90}ms`);
		if (a && prevAudioEnd !== null && a.tfdt !== prevAudioEnd) console.log(`  !! audio gap ${(a.tfdt - prevAudioEnd) / sampleRate * 1000}ms`);
		prevVideoEnd = v ? v.tfdt + v.dur : null;
		prevAudioEnd = a ? a.tfdt + a.n * 1024 : null;
	}
	if (outDir) {
		fs.mkdirSync(outDir, {recursive: true});
		fs.writeFileSync(path.join(outDir, 'remuxed.mp4'), Buffer.concat(parts));
		console.log(`wrote ${path.join(outDir, 'remuxed.mp4')}`);
	}
})();
