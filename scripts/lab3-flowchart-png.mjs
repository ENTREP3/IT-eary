// Renders the journey flowchart from docs/lab3-presentation.html to a PNG.
//
// Word's HTML import does not handle inline SVG reliably, so the .docx build
// needs a raster copy. Captured at 2x in the light theme, clipped to the
// <svg class="flowchart"> element only.
//
// Run after `node scripts/build-lab3-page.mjs`:
//   node scripts/lab3-flowchart-png.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'docs', 'lab3-presentation.html')).href;
const OUT = path.join(ROOT, 'docs', 'screenshots', '00-journey-flowchart.png');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9366;
const userDir = path.join(os.tmpdir(), 'edge-flow-' + Date.now());

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1500,1200', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--force-color-profile=srgb', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://localhost:${PORT}/json`)).json();
      const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no CDP target');
}

function cdp(ws) {
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}

try {
  const t = await target();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(3500);

  const evaluate = async (e) =>
    (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  // The document copy is always light, whatever the machine's OS theme is.
  await evaluate(`document.documentElement.setAttribute('data-theme','light'); 'ok'`);
  // Let the chart use its full natural width rather than the article column.
  await evaluate(`
    (function(){
      const svg = document.querySelector('.flowchart');
      svg.style.minWidth = '1180px';
      svg.closest('.scroll').style.overflow = 'visible';
      svg.scrollIntoView();
      window.scrollBy(0, -40);
      return 'ok';
    })()
  `);
  await sleep(900);

  // captureBeyondViewport clips in PAGE coordinates, but getBoundingClientRect
  // is viewport-relative — without adding the scroll offset the clip lands at
  // the top of the document and captures the masthead instead.
  const box = await evaluate(`
    (function(){
      const r = document.querySelector('.flowchart').getBoundingClientRect();
      return JSON.stringify({
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        w: r.width,
        h: r.height
      });
    })()
  `);
  const { x, y, w, h } = JSON.parse(box);

  const pad = 14;
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: Math.max(0, x - pad), y: Math.max(0, y - pad), width: w + pad * 2, height: h + pad * 2, scale: 2 },
  });

  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log(`wrote ${path.relative(ROOT, OUT)} — ${Math.round((w + pad * 2) * 2)}x${Math.round((h + pad * 2) * 2)}px`);
  ws.close();
} catch (e) {
  console.error('CDP error:', e.message);
  process.exitCode = 1;
} finally {
  edge.kill();
  await sleep(400);
}
