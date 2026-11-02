// Exercises the modified player's playback-error handling in a test Firefox (started with --remote-debugging-port):
// two simulated HEVC errors (expect: reload + HEVC retry, then reload into H.264), the report page's segment download
// links, and a simulated non-HEVC error (expect: report page instead of J0206).
// Usage: node e2e_errorpaths.mjs <port> <extension dir> <channel>
const [port, extDir, channel] = process.argv.slice(2);
const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
let nextId = 1;
const pending = new Map();
ws.onmessage = ev => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const {resolve, reject} = pending.get(msg.id);
		pending.delete(msg.id);
		msg.type === 'error' ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result);
	}
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const id = nextId++;
	pending.set(id, {resolve, reject});
	ws.send(JSON.stringify({id, method, params}));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async (context, expression) => {
	const r = await send('script.evaluate', {expression, target: {context}, awaitPromise: true});
	return r.type === 'exception' ? `exception: ${r.exceptionDetails.text}` : r.result.value;
};
const state = `JSON.stringify({
	codecs: (performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('usher.ttvnw.net')).pop() || '').replace(/.*supported_codecs=([^&]*).*/, '$1'),
	hevcState: sessionStorage.getItem('tw5-ошибка-hevc'),
	playing: !!document.querySelector('video') && document.querySelector('video').currentTime > 0
})`;
const report = `(() => {
	const f = document.querySelector('iframe');
	const d = f && f.contentDocument;
	if (!d) return 'no report page';
	const form = [...d.forms].find(x => !x.hidden);
	const links = [...d.querySelectorAll('a[download]')].map(a => a.download + ' ' + a.textContent);
	return JSON.stringify({form: form && form.id, reason: form && form.elements['отладка-отчет'] ? JSON.parse(form.elements['отладка-отчет'].value).ПричинаЗавершенияРаботы : null, links,
		text: d.body.innerText.match(/Segments before[^:]*:/) ? d.body.innerText.match(/Segments before[^:]*:/)[0] : null});
})()`;

await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
await send('session.new', {capabilities: {}});
try {
	await send('webExtension.install', {extensionData: {type: 'path', path: extDir}});
	const {context} = await send('browsingContext.create', {type: 'tab'});
	const open = async () => {
		await send('browsingContext.navigate', {context, url: `https://www.twitch.tv/${channel}`, wait: 'none'});
		for (let i = 0; i < 20; i++) {
			await sleep(1000);
			const {contexts} = await send('browsingContext.getTree', {root: context, maxDepth: 0});
			if (contexts[0].url.startsWith('moz-extension://')) return;
		}
		throw new Error('no redirect to the player');
	};
	await open();
	await sleep(10000);
	console.log('start              ', await evaluate(context, state));
	for (const n of [1, 2]) {
		console.log(`HEVC error #${n}       `, await evaluate(context, `m = м_Отладка.ОбработатьОшибкуВоспроизведения('MediaError 3: simulated HEVC failure #${n} (test)', true)`));
		await sleep(14000);
		console.log(`after reload #${n}     `, await evaluate(context, state));
	}
	await evaluate(context, `м_Отладка.ЗавершитьРаботуИОтправитьОтзыв()`);
	await sleep(3000);
	console.log('feedback report    ', await evaluate(context, report));
	await open();
	await sleep(10000);
	console.log('reopened           ', await evaluate(context, state));
	console.log('non-HEVC error     ', await evaluate(context, `м_Отладка.ОбработатьОшибкуВоспроизведения('MediaError 3: simulated decode error (test)', false)`));
	await sleep(3000);
	console.log('error report       ', await evaluate(context, report));
	// A tab locked to H.264 must not reload again on an "HEVC" error: it shows the report page.
	await open();
	await sleep(10000);
	console.log('HEVC error, locked ', await evaluate(context, `м_Отладка.ОбработатьОшибкуВоспроизведения('MediaError 3: simulated HEVC failure while locked (test)', true)`));
	await sleep(4000);
	console.log('locked: report     ', await evaluate(context, report), await evaluate(context, state));
} finally {
	await send('session.end', {}).catch(() => {});
	ws.close();
}
