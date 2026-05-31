// Open a throwaway Chrome tab (via CDP on :9222), load the given URL, and report
// whether it compiled & rendered (no Vite error overlay) — SSR 200 alone lies.
// Usage: node verify-render.mjs [url]   (default http://localhost:4399/)
const BASE = 'http://localhost:9222';
const URL = process.argv[2] || 'http://localhost:4399/';

const http = (method, path) => fetch(`${BASE}${path}`, { method }).then(r => r.json());

let tab;
try { tab = await http('PUT', `/json/new?${encodeURIComponent(URL)}`); }
catch { tab = await http('GET', `/json/new?${encodeURIComponent(URL)}`); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise(res => { const m = ++id; pending.set(m, res); ws.send(JSON.stringify({ id: m, method, params })); });
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
});

await new Promise(r => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await new Promise(r => setTimeout(r, 2500));

const expr = `JSON.stringify({
  viteError: (()=>{ const o=document.querySelector('vite-error-overlay'); return o ? (o.shadowRoot?.querySelector('.message')?.textContent||'overlay present') : null; })(),
  rendered: !!document.querySelector('header, #app, main'),
  bodyLen: document.body.innerText.length,
})`;
const { result } = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(result.value);

try { await http('GET', `/json/close/${tab.id}`); } catch {}
ws.close();
