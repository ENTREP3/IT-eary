// Captures the evidence screenshots referenced by docs/lab3-worksheet.md.
//
// Drives the real app headlessly through the Chrome DevTools Protocol using
// Edge, so every image is of the running system rather than a mockup. It walks
// the full diner -> cashier -> owner loop:
//
//   storefront menu -> cart -> ticket issued -> cashier settles -> owner sees it
//
// Prerequisites: `npm run dev` on :5173 and the Supabase stack up.
// Run with: node scripts/lab3-shots.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:5173';
const PORT = 9344;
const userDir = path.join(os.tmpdir(), 'edge-cdp-lab3-' + Date.now());

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1440,1100', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--disable-features=msEdgeSync,msImplicitSignin,EdgeFollow',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('No CDP page target found');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
}

let shots = 0;

async function main() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      console.warn('  ! eval threw:', r.result.exceptionDetails.text);
    }
    return r.result?.result?.value;
  };

  const go = async (route, settle = 3500) => {
    await send('Page.navigate', { url: APP + route });
    await sleep(settle);
  };

  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, name + '.png');
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    shots++;
    console.log('  saved', path.relative(ROOT, file));
  };

  // Click the first button/link whose visible text contains `text`.
  const clickText = (text, tag = 'button') => evaluate(`
    (function(){
      const el = [...document.querySelectorAll('${tag}')]
        .find(x => (x.innerText || '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!el) return 'not found: ${text}';
      el.click();
      return 'clicked';
    })()
  `);

  const setInput = (selector, value) => evaluate(`
    (function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'no input';
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'set';
    })()
  `);

  // -------------------------------------------------------------------------
  // 1. Diner storefront — the live menu
  // -------------------------------------------------------------------------
  console.log('storefront');
  await go('/menu', 4500);   // '/' is the landing page; the menu lives here now
  // Land on the main-dish category — the default lands wherever stock allows,
  // which can be a one-item drinks list and makes a thin screenshot.
  await clickText('Ulam');
  await sleep(1200);
  await shot('01-storefront-menu');
  console.log('  dishes on screen:', await evaluate(`document.querySelectorAll('img').length`));

  // -------------------------------------------------------------------------
  // 2. Cart — add two dishes, open the cart
  // -------------------------------------------------------------------------
  console.log('cart');
  await evaluate(`
    (function(){
      const adds = [...document.querySelectorAll('button')]
        .filter(b => b.querySelector('svg.lucide-plus') || b.getAttribute('aria-label') === 'add');
      adds.slice(0, 2).forEach(b => { b.click(); b.click(); });
      return adds.length;
    })()
  `);
  await sleep(900);
  await clickText('\u20b1');           // the cart pill shows the running total
  await sleep(1400);
  await shot('02-cart');

  // -------------------------------------------------------------------------
  // 3. Ticket — check out and capture the issued code
  // -------------------------------------------------------------------------
  console.log('ticket');
  await clickText('Cash');            // the cart sheet already holds the method choice
  await sleep(600);
  await clickText('Get my ticket');
  await sleep(4500);
  await shot('03-ticket-issued');
  const ticket = await evaluate(`
    (function(){
      const m = document.body.innerText.match(/\\b[2-9A-HJ-NP-Z]{6}\\b/);
      return m ? m[0] : null;
    })()
  `);
  console.log('  ticket code:', ticket);

  // -------------------------------------------------------------------------
  // 4. Cashier — sign in, look the ticket up, settle it
  // -------------------------------------------------------------------------
  console.log('cashier');
  await go('/cashier', 3500);
  await shot('04-staff-sign-in');

  await setInput('input[type=email]', 'cashier@bencris.local');
  await setInput('input[type=password]', 'cashier123');
  await clickText('sign in');
  await sleep(4500);
  await shot('05-cashier-lookup');

  if (ticket) {
    await setInput('input[type=text]', ticket);
    await sleep(400);
    await clickText('find');
    await sleep(2500);
    await shot('06-cashier-order-review');
  }

  // -------------------------------------------------------------------------
  // 5. Owner dashboard
  // -------------------------------------------------------------------------
  console.log('owner');
  await go('/admin', 3500);
  await evaluate(`
    (async function(){
      const keys = Object.keys(localStorage).filter(k => k.includes('auth-token'));
      keys.forEach(k => localStorage.removeItem(k));
      return 'cleared';
    })()
  `);
  await go('/admin', 3000);
  await setInput('input[type=email]', 'admin@bencris.local');
  await setInput('input[type=password]', 'admin123');
  await clickText('sign in');
  await sleep(5000);
  await shot('07-admin-dashboard');

  for (const [tab, name] of [
    ['Kitchen', '08-admin-kitchen'],
    ['Menu', '09-admin-menu'],
    ['Sales', '10-admin-analytics'],
    ['Payments', '11-admin-payments'],
    ['Inventory', '12-admin-inventory'],
  ]) {
    const r = await clickText(tab);
    await sleep(2200);
    if (r === 'clicked') await shot(name);
    else console.log(`  skipped ${name} (${r})`);
  }

  ws.close();
}

try {
  await main();
  console.log(`\ndone — ${shots} screenshots in docs/screenshots/`);
} catch (e) {
  console.error('CDP error:', e.message);
  process.exitCode = 1;
} finally {
  edge.kill();
  await sleep(500);
}
