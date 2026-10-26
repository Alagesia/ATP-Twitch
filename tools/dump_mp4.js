// Dump the structure of fMP4 init/media segments (track config, tfhd/tfdt/trun, emsg, NAL types).
// Usage: node dump_mp4.js <file> [<file>...]   (files may be init+media concatenated or separate)
'use strict';
const fs = require('fs');

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'dinf', 'edts']);

function boxes(b, start, end) {
	const out = [];
	for (let i = start; i + 8 <= end;) {
		let size = b.readUInt32BE(i), hdr = 8;
		const type = b.toString('latin1', i + 4, i + 8);
		if (size === 1) { size = Number(b.readBigUInt64BE(i + 8)); hdr = 16; } else if (size === 0) size = end - i;
		out.push({type, start: i, body: i + hdr, end: i + size});
		i += size;
	}
	return out;
}

function cstr(b, i) { const z = b.indexOf(0, i); return [b.toString('utf8', i, z), z + 1]; }

function dumpInit(b, box, ind) {
	for (const x of boxes(b, box.body, box.end)) {
		const p = ind + x.type;
		if (x.type === 'tkhd') console.log(p, 'v', b[x.body], 'trackId', b[x.body] ? b.readUInt32BE(x.body + 20) : b.readUInt32BE(x.body + 12));
		else if (x.type === 'mdhd') console.log(p, 'v', b[x.body], 'timescale', b[x.body] ? b.readUInt32BE(x.body + 20) : b.readUInt32BE(x.body + 12));
		else if (x.type === 'hdlr') console.log(p, b.toString('latin1', x.body + 8, x.body + 12));
		else if (x.type === 'trex') console.log(p, 'track', b.readUInt32BE(x.body + 4), 'sdi', b.readUInt32BE(x.body + 8), 'dur', b.readUInt32BE(x.body + 12), 'size', b.readUInt32BE(x.body + 16), 'flags', b.readUInt32BE(x.body + 20).toString(16));
		else if (x.type === 'stsd') {
			for (const e of boxes(b, x.body + 8, x.end)) {
				console.log(ind + '  ' + e.type, e.end - e.start);
				const inner = e.type === 'mp4a' ? e.body + 28 : e.body + 78;
				if (e.type === 'avc1' || e.type === 'avc3') console.log(ind + '    w x h', b.readUInt16BE(e.body + 24), b.readUInt16BE(e.body + 26));
				if (e.type === 'mp4a') console.log(ind + '    channels', b.readUInt16BE(e.body + 16), 'rate', b.readUInt32BE(e.body + 24) >>> 16);
				for (const c of boxes(b, inner, e.end)) {
					console.log(ind + '    ' + c.type, c.end - c.start, b.toString('hex', c.body, Math.min(c.end, c.body + 64)));
					if (c.type === 'avcC') console.log(ind + '      lengthSize', (b[c.body + 4] & 3) + 1, 'numSPS', b[c.body + 5] & 31);
				}
			}
		} else console.log(p, x.end - x.start);
		if (CONTAINERS.has(x.type)) dumpInit(b, x, ind + '  ');
	}
}

function dumpMoof(b, moof, mdat, verbose) {
	for (const traf of boxes(b, moof.body, moof.end).filter(x => x.type === 'traf')) {
		let track, line = [];
		for (const x of boxes(b, traf.body, traf.end)) {
			const v = b[x.body], fl = b.readUIntBE(x.body + 1, 3);
			if (x.type === 'tfhd') {
				track = b.readUInt32BE(x.body + 4);
				let o = x.body + 8; const f = {};
				if (fl & 1) { f.base = Number(b.readBigUInt64BE(o)); o += 8; }
				if (fl & 2) { f.sdi = b.readUInt32BE(o); o += 4; }
				if (fl & 8) { f.dur = b.readUInt32BE(o); o += 4; }
				if (fl & 0x10) { f.size = b.readUInt32BE(o); o += 4; }
				if (fl & 0x20) { f.flags = b.readUInt32BE(o).toString(16); o += 4; }
				line.push(`tfhd track=${track} flags=${fl.toString(16)} ${JSON.stringify(f)}`);
			} else if (x.type === 'tfdt') {
				line.push(`tfdt v${v} ${v ? b.readBigUInt64BE(x.body + 4) : b.readUInt32BE(x.body + 4)}`);
			} else if (x.type === 'trun') {
				const n = b.readUInt32BE(x.body + 4); let o = x.body + 8; let dataOff = null, first = null;
				if (fl & 1) { dataOff = b.readInt32BE(o); o += 4; }
				if (fl & 4) { first = b.readUInt32BE(o).toString(16); o += 4; }
				const samples = [];
				for (let i = 0; i < n; i++) {
					const s = {};
					if (fl & 0x100) { s.d = b.readUInt32BE(o); o += 4; }
					if (fl & 0x200) { s.s = b.readUInt32BE(o); o += 4; }
					if (fl & 0x400) { s.f = b.readUInt32BE(o).toString(16); o += 4; }
					if (fl & 0x800) { s.c = v ? b.readInt32BE(o) : b.readUInt32BE(o); o += 4; }
					samples.push(s);
				}
				line.push(`trun v${v} flags=${fl.toString(16)} n=${n} dataOffset=${dataOff} firstFlags=${first} ` + JSON.stringify(verbose ? samples : samples.slice(0, 3)));
				if (track === 1 && dataOff !== null && verbose) {
					// NAL types of first sample (assumes 4-byte lengths, default-base-is-moof)
					let p = moof.start + dataOff, endS = p + samples[0].s, types = [];
					while (p < endS) { const len = b.readUInt32BE(p); types.push(b[p + 4] & 31); p += 4 + len; }
					line.push(`  first sample NAL types: ${types}`);
				}
			} else line.push(`${x.type} ${x.end - x.start}`);
		}
		console.log('   ', line.join('\n     '));
	}
}

for (const f of process.argv.slice(2)) {
	const b = fs.readFileSync(f);
	console.log(`=== ${f} (${b.length} bytes) first=${b.toString('hex', 0, 8)}`);
	const top = boxes(b, 0, b.length);
	let moofCount = 0;
	for (let i = 0; i < top.length; i++) {
		const x = top[i];
		if (x.type === 'moov') { console.log('moov'); dumpInit(b, x, '  '); }
		else if (x.type === 'emsg') {
			const v = b[x.body]; let o = x.body + 4, scheme, value, ts, pt, dur, id;
			if (v === 0) { [scheme, o] = cstr(b, o); [value, o] = cstr(b, o); ts = b.readUInt32BE(o); pt = b.readUInt32BE(o + 4); dur = b.readUInt32BE(o + 8); id = b.readUInt32BE(o + 12); o += 16; }
			else { ts = b.readUInt32BE(o); pt = b.readBigUInt64BE(o + 4); dur = b.readUInt32BE(o + 12); id = b.readUInt32BE(o + 16); o += 20; [scheme, o] = cstr(b, o); [value, o] = cstr(b, o); }
			const msg = b.subarray(o, x.end);
			console.log(`emsg v${v} scheme=${scheme} value=${value} timescale=${ts} time=${pt} dur=${dur} id=${id} msgLen=${msg.length}`);
			console.log('   msg:', JSON.stringify(msg.toString('latin1').replace(/[^\x20-\x7e]/g, '.')).slice(0, 400));
		} else if (x.type === 'moof') {
			moofCount++;
			console.log(`moof #${moofCount} @${x.start}`);
			dumpMoof(b, x, top[i + 1], moofCount === 1);
		} else if (x.type !== 'mdat') console.log(x.type, x.end - x.start);
	}
	console.log(`moof count: ${moofCount}`);
}
