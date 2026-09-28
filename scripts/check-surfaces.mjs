// Checks that each deployed address opens the app it is supposed to.
//
// One bundle is served from three addresses and decides at runtime which of
// the three faces to show, from the hostname. That decision is invisible to
// anything that only reads HTML: all three addresses return a byte-identical
// index.html, so curl cannot tell a working deploy from a broken one, and a
// staff address quietly serving the storefront looks completely healthy from
// outside.
//
// It has already broken once. The surfaces were picked by adding a `path="*"`
// route above the diner's routes, on the assumption that <Routes> tries them
// in order. It does not — React Router ranks by specificity and `/` beats `*`
// at the root — so every staff address served the menu while every automated
// check passed.
//
// So this drives a real browser and asks what actually rendered.
//
// Run with: node scripts/check-surfaces.mjs [base-domain]
//   default: the .web.app addresses
//   once the custom domains are live: node scripts/check-surfaces.mjs iteary.site
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const domain = process.argv[2];

/**
 * What each surface must show, and what proves it is not one of the others.
 *
 * Matching on visible text rather than a test id, because a test id can be
 * copied between components and still be wrong; the words "Sign in to the
 * counter" only appear when the counter is what loaded.
 */
const SURFACES = domain
  ? [
      // The shop sits on its own name under the domain rather than at the
      // apex, so `bencris.` is part of the address and not a stray prefix.
      { name: 'diner', url: `https://bencris.${domain}` },
      { name: 'admin', url: `https://bencris-admin.${domain}` },
      { name: 'cashier', url: `https://bencris-cashier.${domain}` },
    ]
  : [
      { name: 'diner', url: 'https://bencris.web.app' },
      { name: 'admin', url: 'https://bencris-admin.web.app' },
      { name: 'cashier', url: 'https://bencris-cashier.web.app' },
    ];

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9412;

const edge = spawn(
  EDGE,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1280,900',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge-surface-' + Date.now())}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ],
  { stdio: 'ignore' },
);

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
  throw new Error('no CDP target; is Edge installed at the expected path?');
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Page.enable');
await send('Runtime.enable');

const ev = (e) =>
  send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }).then(
    (r) => r.result?.result?.value,
  );

let failures = 0;

console.log(`checking ${SURFACES.length} addresses\n`);

for (const s of SURFACES) {
  await send('Page.navigate', { url: s.url });
  await sleep(4000);

  const text = (await ev('(document.body.innerText || "").slice(0, 4000)')) ?? '';
  const lower = text.toLowerCase();

  /**
   * The storefront is the thing every broken surface falls back to, so the
   * test is not "does the dashboard look right" but "is this the menu". The
   * hero's own wording is what gives it away.
   */
  const looksDiner =
    lower.includes('order from the live menu') ||
    lower.includes('view the menu') ||
    lower.includes('best sellers') ||
    lower.includes('what is cooking');

  // Both staff surfaces meet a sign-in wall when signed out, which is the
  // correct answer here: reaching RequireRole means routing chose the staff
  // tree. What must not happen is landing on the menu.
  const looksStaff =
    lower.includes('sign in') ||
    lower.includes('counter') ||
    lower.includes('dashboard') ||
    lower.includes('owner');

  const ok = s.name === 'diner' ? looksDiner : looksStaff && !looksDiner;
  if (!ok) failures++;

  const excerpt = text.replace(/\s*\n+\s*/g, ' | ').trim().slice(0, 180);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${s.name.padEnd(8)} ${s.url}`);
  console.log(`        ${excerpt || '(blank)'}`);
  if (!ok && s.name !== 'diner' && looksDiner) {
    console.log('        ^ this is the storefront, not the staff app');
  }
}

ws.close();
edge.kill();

console.log(failures ? `\n${failures} wrong` : '\nevery address opens the right app');
process.exit(failures ? 1 : 0);
