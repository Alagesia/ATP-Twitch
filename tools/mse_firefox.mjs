// Opens mse_test.html for each fixture dir in a Firefox started with --remote-debugging-port and
// prints window.result. Usage: node mse_firefox.mjs <port> <base url> <dir:count> [<dir:count>...]
const [port, baseUrl, ...tests] = process.argv.slice(2);
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
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
await send('session.new', {capabilities: {}});
try {
	const {context} = await send('browsingContext.create', {type: 'tab'});
	for (const test of tests) {
		const [dir, n] = test.split(':');
		await send('browsingContext.navigate', {context, url: `${baseUrl}/mse_test.html?dir=${dir}&n=${n}`, wait: 'complete'});
		let value;
		for (let i = 0; i < 60; i++) {
			await new Promise(r => setTimeout(r, 500));
			const r = await send('script.evaluate', {expression: 'JSON.stringify(window.result)', target: {context}, awaitPromise: false});
			value = r.result.value;
			if (!value.includes('"state":"running"')) break;
		}
		console.log(`${dir}: ${value}`);
	}
} finally {
	await send('session.end', {}).catch(() => {});
	ws.close();
}
