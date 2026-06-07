// Drives the admin flow headlessly via Chrome DevTools Protocol using Edge.
// Steps: open app -> Ctrl+Shift+A (admin gate) -> shot -> login -> shot dashboard
//        -> click Payments tab -> shot.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:5173/';
const PORT = 9333;
const userDir = path.join(os.tmpdir(), 'edge-cdp-iteary-' + Date.now());

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1440,1000', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`,
  // Suppress Edge's first-run / account-sync interstitial so the app loads.
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--disable-features=msEdgeSync,msImplicitSignin,EdgeFollow',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
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

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}

async function shot(send, file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
}

const base = 'C:\\Users\\SIBIYA GAMING\\OneDrive\\Desktop\\IT-eary\\';

try {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));
  const send = cdp(ws);

  await send('Page.enable');
  await send('Runtime.enable');
  // Explicitly navigate the connected tab to the app (don't rely on Edge's
  // startup tab, which may be a sign-in promo).
  await send('Page.navigate', { url: APP });
  await sleep(4000); // let React mount + stores hydrate

  // 0. Customer storefront (menu now served from Postgres).
  await shot(send, base + 'verify-customer.png');
  const menuLive = await evaluate(send, `document.body.innerText.includes('Chicken Adobo')`);
  console.log('customer menu (from DB) visible:', menuLive);

  // 1. Trigger the admin gate via the keyboard shortcut the app listens for.
  await evaluate(send, `window.dispatchEvent(new KeyboardEvent('keydown',{key:'A',ctrlKey:true,shiftKey:true,bubbles:true}));'ok'`);
  await sleep(1200);
  await shot(send, base + 'verify-admin-login.png');
  const gate = await evaluate(send, `document.body.innerText.includes('Staff sign in')`);
  console.log('admin gate visible:', gate);

  // 2. Fill the admin login form + submit.
  await evaluate(send, `
    (function(){
      function setVal(el, value){
        const proto = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(el, value);
        el.dispatchEvent(new Event('input',{bubbles:true}));
      }
      const email = document.querySelector('input[type=email]');
      const pass = document.querySelector('input[type=password]');
      setVal(email,'admin@iteary.local');
      setVal(pass,'admin123');
      const btn = document.querySelector('button[type=submit]');
      btn && btn.click();
      return 'submitted';
    })()
  `);
  await sleep(4000); // login round-trip + orders load
  await shot(send, base + 'verify-admin-dashboard.png');
  const onDash = await evaluate(send, `document.body.innerText.includes('Today') || document.body.innerText.includes('pulse')`);
  const dashText = await evaluate(send, `document.body.innerText.slice(0,400)`);
  console.log('dashboard visible:', onDash);
  console.log('--- dashboard text ---\n' + dashText);

  const clickTab = async (name) =>
    evaluate(send, `
      (function(){
        const b = [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='${name}');
        b && b.click(); return b ? 'clicked' : 'not found';
      })()
    `);

  // 3. Kitchen / order-queue board.
  await clickTab('Kitchen');
  await sleep(1500);
  await shot(send, base + 'verify-admin-kitchen.png');
  console.log('kitchen lanes visible:', await evaluate(send, `document.body.innerText.includes('Preparing') && document.body.innerText.includes('Ready')`));

  // 4. Sales & Profit (live expenses + profit chart + expenses manager).
  await clickTab('Sales & Profit');
  await sleep(1800);
  await shot(send, base + 'verify-admin-analytics.png');
  console.log('analytics expenses visible:', await evaluate(send, `document.body.innerText.includes('Expenses') && document.body.innerText.includes("Today's net")`));

  // 5. Payments tab.
  await clickTab('Payments');
  await sleep(1500);
  await shot(send, base + 'verify-admin-payments.png');
  console.log('payments panel visible:', await evaluate(send, `document.body.innerText.includes('Where money lands')`));

  ws.close();
} catch (e) {
  console.error('CDP error:', e.message);
} finally {
  edge.kill();
  await sleep(500);
}
