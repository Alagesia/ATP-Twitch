// End-to-end test: drives a headless Firefox (started separately with --remote-debugging-port) over
// WebDriver BiDi, installs the extension temporarily, opens the player on a channel and samples the
// <video> element. Usage: node e2e_firefox.mjs <port> <extension dir> <uuid> <channel> <seconds> [switchAtSeconds variantIndex]
// The optional switch calls the player's own м_Список.ИзменитьВариантТрансляции(variantIndex) mid-playback.

const [port, extDir, uuid, channel, seconds, switchAt, variantIndex] = process.argv.slice(2);
const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
let nextId = 1;
const pending = new Map();
const logs = [];
ws.onmessage = ev => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const {resolve, reject} = pending.get(msg.id);
		pending.delete(msg.id);
		msg.type === 'error' ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result);
	} else if (msg.method === 'log.entryAdded') {
		const e = msg.params;
		logs.push(`[${e.level}] ${e.text || (e.args || []).map(a => a.value).join(' ')}`);
	}
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const id = nextId++;
	pending.set(id, {resolve, reject});
	ws.send(JSON.stringify({id, method, params}));
});
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

await send('session.new', {capabilities: {}});
process.on('uncaughtException', e => { console.log('FAILED:', e.message); send('session.end', {}).finally(() => process.exit(1)); });
process.on('unhandledRejection', e => { console.log('FAILED:', e.message); send('session.end', {}).finally(() => process.exit(1)); });
await send('session.subscribe', {events: ['log.entryAdded']});
const ext = await send('webExtension.install', {extensionData: {type: 'path', path: extDir}});
console.log('installed extension', ext.extension);
const {context} = await send('browsingContext.create', {type: 'tab'});
await send('browsingContext.setViewport', {context, viewport: {width: 1280, height: 720}}).catch(e => console.log('setViewport:', e.message));
// Real user flow: open the channel on twitch.tv and let content.js redirect to the extension's player.
await send('browsingContext.navigate', {context, url: `https://www.twitch.tv/${encodeURIComponent(channel)}`, wait: 'none'});
for (let i = 0; i < 20; i++) {
	await new Promise(r => setTimeout(r, 1000));
	const {contexts} = await send('browsingContext.getTree', {root: context, maxDepth: 0});
	if (contexts[0].url.startsWith(uuid === '*' ? 'moz-extension://' : `moz-extension://${uuid}/`)) {
		console.log('redirected to', contexts[0].url);
		break;
	}
	if (i === 19) throw new Error(`no redirect to the player, still at ${contexts[0].url}`);
}

const probe = `(() => {
	const v = document.querySelector('video');
	if (!v) return JSON.stringify({noVideo: true, body: document.body ? document.body.innerText.slice(0, 300) : ''});
	const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
	const b = [];
	for (let i = 0; i < v.buffered.length; i++) b.push([+v.buffered.start(i).toFixed(2), +v.buffered.end(i).toFixed(2)]);
	const usher = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('usher.ttvnw.net')).pop();
	return JSON.stringify({ad: document.body.classList.contains('реклама'), codecsRequested: usher && new URL(usher).searchParams.get('supported_codecs'), ready: v.readyState, t: +v.currentTime.toFixed(2), paused: v.paused, size: v.videoWidth + 'x' + v.videoHeight,
		frames: q.totalVideoFrames, dropped: q.droppedVideoFrames, corrupted: q.corruptedVideoFrames, err: v.error && v.error.code,
		buffered: b, msg: (document.body.innerText.match(/encrypted|error|problem|unable/i) || [''])[0]});
})()`;
const samples = [];
for (let s = 0; s < Number(seconds); s += 3) {
	await new Promise(r => setTimeout(r, 3000));
	const r = await send('script.evaluate', {expression: probe, target: {context}, awaitPromise: false});
	const val = r.result && r.result.value;
	samples.push(val);
	console.log(`t+${s + 3}s`, val);
	if (switchAt !== undefined && s + 3 === Number(switchAt)) {
		await send('script.evaluate', {expression: `м_Список.ИзменитьВариантТрансляции(${Number(variantIndex)})`, target: {context}, awaitPromise: false});
		console.log(`switched to variant #${variantIndex}`);
	}
}
const interesting = logs.filter(l => /error|Worker\] (Формат|Сегмент иниц|MP4 Фраг)|Ой|исключение|Exception|encrypted/i.test(l));
console.log(`--- ${logs.length} console entries, ${interesting.length} interesting (first 40) ---`);
interesting.slice(0, 40).forEach(l => console.log(l.slice(0, 300)));
await send('session.end', {}).catch(() => {});
ws.close();
