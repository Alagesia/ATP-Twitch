// Records the usher playlist requests Twitch's own web player makes (token/sig redacted).
// Usage: node capture_official.mjs <port> <channel> <seconds> [extension id to uninstall first]
const [port, channel, seconds, extId] = process.argv.slice(2);
const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
let nextId = 1;
const pending = new Map();
const seen = new Set();
ws.onmessage = ev => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const {resolve, reject} = pending.get(msg.id);
		pending.delete(msg.id);
		msg.type === 'error' ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result);
	} else if (msg.method === 'network.beforeRequestSent') {
		const url = msg.params.request.url;
		if (/usher\.ttvnw\.net\/api\/(v2\/)?channel\/hls/.test(url) && !seen.has(url)) {
			seen.add(url);
			const u = new URL(url);
			for (const k of ['token', 'sig', 'p', 'play_session_id']) if (u.searchParams.has(k)) u.searchParams.set(k, '…');
			console.log('USHER', u.pathname, [...u.searchParams].map(([k, v]) => `${k}=${v}`).join(' '));
		}
	}
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const id = nextId++;
	pending.set(id, {resolve, reject});
	ws.send(JSON.stringify({id, method, params}));
});
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
await send('session.new', {capabilities: {}});
try {
	if (extId) await send('webExtension.uninstall', {extension: extId}).then(() => console.log('uninstalled', extId), e => console.log('uninstall:', e.message));
	await send('session.subscribe', {events: ['network.beforeRequestSent']});
	const {context} = await send('browsingContext.create', {type: 'tab'});
	await send('browsingContext.navigate', {context, url: `https://www.twitch.tv/${channel}`, wait: 'none'});
	await new Promise(r => setTimeout(r, Number(seconds) * 1000));
	const r = await send('script.evaluate', {expression: `(() => { const v = document.querySelector('video'); return JSON.stringify({size: v && v.videoWidth + 'x' + v.videoHeight, t: v && v.currentTime, hevc: MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L150.B0"'), av1: MediaSource.isTypeSupported('video/mp4; codecs="av01.0.12M.08"')}); })()`, target: {context}, awaitPromise: false});
	console.log('official player video:', r.result.value);
} finally {
	await send('session.end', {}).catch(() => {});
	ws.close();
}
