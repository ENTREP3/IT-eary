// Generates the design tokens consumed by both frontends from design/tokens.json.
//
//   src/styles/tokens.css   Tailwind v4 @theme block  -> bg-staff-ground, ...
//   mobile/lib/tokens.dart  Dart constants            -> Tokens.staffGround, ...
//
// Run with `npm run tokens`. Both outputs are generated — never hand-edit them.
//
// Both generated files are COMMITTED on purpose: `npm run dev` / `npm run build`
// regenerate them, but `flutter build` does not run npm, so mobile/lib/tokens.dart
// must exist in the repo or the Flutter apps will not compile on a clean clone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));

const BANNER = [
  'GENERATED FILE — DO NOT EDIT.',
  'Source: design/tokens.json   Regenerate: npm run tokens',
];

/** { staff: { ground: {value} } } -> [['staff-ground', '#0f1410', comment], ...] */
function flattenColors() {
  const out = [];
  for (const [group, entries] of Object.entries(tokens.color)) {
    for (const [name, token] of Object.entries(entries)) {
      const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      out.push([`${group}-${kebab}`, token.value, token.comment ?? '']);
    }
  }
  return out;
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Tailwind v4: colours registered under --color-* become real utilities, so a
// component writes `bg-staff-ground` instead of the arbitrary `bg-[#0f1410]`.
// ---------------------------------------------------------------------------
function buildCss() {
  const lines = [
    ...BANNER.map((l) => `/* ${l} */`),
    '',
    '@theme {',
  ];

  let group = null;
  for (const [name, value, comment] of flattenColors()) {
    const g = name.split('-')[0];
    if (g !== group) {
      lines.push(`${group ? '\n' : ''}  /* ${g} */`);
      group = g;
    }
    lines.push(`  --color-${name}: ${value};${comment ? ` /* ${comment} */` : ''}`);
  }

  lines.push('', '  /* radius */');
  for (const [name, token] of Object.entries(tokens.radius)) {
    lines.push(`  --radius-${name}: ${token.value};`);
  }

  lines.push('', '  /* type */');
  for (const [name, token] of Object.entries(tokens.font)) {
    lines.push(`  --font-${name}: ${token.value};`);
  }

  lines.push('}', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Flutter: plain constants, so Dart gets the identical values.
// ---------------------------------------------------------------------------
function buildDart() {
  const lines = [
    ...BANNER.map((l) => `// ${l}`),
    '',
    "import 'package:flutter/material.dart';",
    '',
    '/// Palette shared with the React apps — see design/tokens.json.',
    'abstract final class Tokens {',
  ];

  let group = null;
  for (const [name, value, comment] of flattenColors()) {
    const g = name.split('-')[0];
    if (g !== group) {
      lines.push(`${group ? '\n' : ''}  // ${g}`);
      group = g;
    }
    const hex = value.replace('#', '').toUpperCase();
    lines.push(
      `  ${comment ? `/// ${comment}\n  ` : ''}static const ${camel(name)} = Color(0xFF${hex});`,
    );
  }

  lines.push('', '  // radius');
  for (const [name, token] of Object.entries(tokens.radius)) {
    const px = parseFloat(token.value);
    lines.push(`  static const radius${name[0].toUpperCase()}${name.slice(1)} = ${px};`);
  }

  lines.push('}', '');
  return lines.join('\n');
}

const outputs = [
  ['src/styles/tokens.css', buildCss()],
  ['mobile/lib/tokens.dart', buildDart()],
];

for (const [rel, content] of outputs) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  console.log(`wrote ${rel} (${content.split('\n').length} lines)`);
}
