// Loads every screen, signs in as staff, and clicks through every tab,
// reporting anything that throws.
//
// Vite strips TypeScript without type-checking it, so a wrong prop, a missing
// import or a helper left behind by a refactor only fails at runtime. An
// earlier version of this script checked routes while signed OUT, which meant
// the staff tabs were never rendered and a missing component in the kitchen
// board went unnoticed. Signing in is the point.
//
// The staff logins are real accounts the owner created, so they are not
// hardcoded here. Put them in .env.local or pass them on the command line:
//
//   CHECK_ADMIN_EMAIL=... CHECK_ADMIN_PASSWORD=... \
//   CHECK_CASHIER_EMAIL=... CHECK_CASHIER_PASSWORD=... node scripts/check-ui.mjs
//
// Without them the public pages are still checked and the staff screens are
// skipped, which is more useful than failing outright.
//
// Run with `npm run dev` up:  node scripts/check-ui.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {
  URL as BACKEND,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CASHIER_EMAIL,
  CASHIER_PASSWORD,
} from './lib/backend.mjs';

const APP = 'http://localhost:5173';
const canSignIn = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD && CASHIER_EMAIL && CASHIER_PASSWORD);

console.log(`checking ${APP} against ${BACKEND}`);
if (!canSignIn) console.log('no staff credentials set, so the staff screens are skipped\n');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9410;

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1100',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'edge-ui-' + Date.now())}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
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
  throw new Error('no CDP target; is the dev server up?');
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
let errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value || a.description || '').join(' ').split('\n')[0].slice(0, 150));
  }
});
const send = (method, params = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');

const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })
  .then((r) => r.result?.result?.value);
const go = async (r, ms = 3600) => { await send('Page.navigate', { url: APP + r }); await sleep(ms); };
const click = (txt, tag = 'button') => ev(`
  (function(){const el=[...document.querySelectorAll('${tag}')].find(x=>(x.innerText||'').trim().toLowerCase().startsWith(${JSON.stringify(txt.toLowerCase())}));
   if(!el) return 'miss'; el.click(); return 'ok';})()`);
const setVal = (sel, v) => ev(`
  (function(){const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'no';
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(v)});
   el.dispatchEvent(new Event('input',{bubbles:true})); return 'ok';})()`);

let failures = 0;
const noise = /favicon|manifest|404 \(Not Found\)|Download the React DevTools/i;

async function step(label, action) {
  errors = [];
  await action();
  const len = await ev('document.getElementById("root")?.innerHTML.length ?? 0');
  const real = errors.filter((e) => !noise.test(e));
  const ok = len > 400 && real.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(28)} ${String(len).padStart(6)} chars`);
  for (const e of real.slice(0, 2)) console.log(`        ${e}`);
}

// ------------------------------------------------------------- public pages
for (const r of ['/', '/menu', '/about', '/faq', '/contact', '/refund', '/privacy', '/account']) {
  await step(r, () => go(r));
}

// Loading a page is not the same as exercising it. A component that only
// appears for a sold-out dish, or behind a category the first render does not
// show, stays unmounted through a plain page load, so a missing import in it
// looks like a pass. Two such crashes shipped before this loop existed.
await step('/menu categories', async () => {
  await go('/menu');
  for (const name of ['Ulam', 'Silog', 'Merienda', 'Inumin']) {
    await ev(`
      (function(){const b=[...document.querySelectorAll('button')]
        .find(x=>(x.innerText||'').trim()===${JSON.stringify(name)});
       if(b) b.click(); return !!b;})()`);
    await sleep(1400);
  }
});

// The sign-in screens themselves render for anyone, so they are always checked.
await step('/cashier sign-in', () => go('/cashier'));
await step('/admin sign-in', () => go('/admin'));

if (canSignIn) {
  // ---------------------------------------------------------------- counter
  await step('/cashier counter', async () => {
    await go('/cashier');
    await setVal('input[type=email]', CASHIER_EMAIL);
    await setVal('input[type=password]', CASHIER_PASSWORD);
    await click('sign in');
    await sleep(4500);
  });
  await step('/cashier kitchen tab', async () => {
    await click('kitchen');
    await sleep(2200);
  });

  // ------------------------------------------------------------------ owner
  await step('/admin dashboard', async () => {
    await ev(`Object.keys(localStorage).filter(k=>k.includes('auth-token')).forEach(k=>localStorage.removeItem(k)); 'ok'`);
    await go('/admin');
    await setVal('input[type=email]', ADMIN_EMAIL);
    await setVal('input[type=password]', ADMIN_PASSWORD);
    await click('sign in');
    await sleep(5000);
  });
  for (const tab of ['Kitchen', 'Inventory', 'Sales', 'Menu', 'Payments', 'Promotions', 'Shop']) {
    await step(`/admin ${tab}`, async () => {
      await click(tab);
      await sleep(2200);
    });
  }
}

console.log(failures === 0 ? '\nevery screen renders cleanly' : `\n${failures} screen(s) need attention`);
ws.close();
edge.kill();
process.exitCode = failures === 0 ? 0 : 1;
