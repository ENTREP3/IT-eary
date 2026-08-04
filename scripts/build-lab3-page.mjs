// Inlines docs/screenshots/*.png into docs/lab3-page.template.html and writes
// docs/lab3-presentation.html.
//
// The published page is served under a strict CSP that blocks every external
// host, so an <img src="docs/screenshots/..."> would silently render nothing.
// Embedding each PNG as a data: URI makes the page genuinely self-contained —
// one file you can open, print, or hand in.
//
// Run with: node scripts/build-lab3-page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'docs', 'lab3-page.template.html');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const OUT = path.join(ROOT, 'docs', 'lab3-presentation.html');

let html = fs.readFileSync(TEMPLATE, 'utf8');

const missing = [];
let embedded = 0;
let bytes = 0;

html = html.replace(/\{\{SHOT:([\w-]+)\}\}/g, (_match, name) => {
  const file = path.join(SHOTS, `${name}.png`);
  if (!fs.existsSync(file)) {
    missing.push(name);
    // A 1x1 transparent PNG keeps the page valid rather than leaving a broken
    // src that renders as a browser error glyph.
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }
  const buf = fs.readFileSync(file);
  embedded++;
  bytes += buf.length;
  return `data:image/png;base64,${buf.toString('base64')}`;
});

fs.writeFileSync(OUT, html);

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`embedded ${embedded} screenshots (${mb(bytes)} MB of PNG)`);
console.log(`wrote ${path.relative(ROOT, OUT)} — ${mb(Buffer.byteLength(html))} MB`);

if (missing.length) {
  console.warn(`\nmissing from docs/screenshots/: ${missing.join(', ')}`);
  console.warn('run `node scripts/lab3-shots.mjs` with the dev server up');
  process.exitCode = 1;
}
