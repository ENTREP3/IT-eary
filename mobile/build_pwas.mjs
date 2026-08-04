// Builds all three mobile apps as installable PWAs.
//
//   node build_pwas.mjs                       -> hosted Supabase (default)
//   node build_pwas.mjs --local               -> local Docker stack
//
// Flutter shares one web/ folder across every target, so all three builds would
// otherwise ship the same manifest and be indistinguishable once installed —
// same name, same icon, three tiles you can't tell apart. Each output's
// manifest.json is rewritten afterwards so they install as separate apps.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL = process.argv.includes('--local');

const backend = LOCAL
  ? {
      url: 'http://127.0.0.1:55321',
      key: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
    }
  : {
      url: 'https://tgazemsmihvodammodfu.supabase.co',
      key: 'sb_publishable_B3mvYfF2pMn2owzwGoHR8Q_Wx74GB7R',
    };

const apps = [
  {
    target: 'lib/main_customer.dart',
    out: 'build/customer',
    name: 'IT-eary',
    short: 'IT-eary',
    description: "Order from the karinderya's live menu and hold your ticket.",
    theme: '#F4EAD5',
    background: '#F4EAD5',
  },
  {
    target: 'lib/main_cashier.dart',
    out: 'build/cashier',
    name: 'IT-eary Counter',
    short: 'Counter',
    description: 'Look up a ticket, check the payment, settle it.',
    theme: '#0F1410',
    background: '#0F1410',
  },
  {
    target: 'lib/main_admin.dart',
    out: 'build/admin',
    name: 'IT-eary Operations',
    short: 'Operations',
    description: 'Sales, kitchen queue, stock, menu and payments.',
    theme: '#0F1410',
    background: '#0F1410',
  },
];

for (const app of apps) {
  console.log(`\n=== ${app.name} → ${app.out} ===`);
  execSync(
    [
      'flutter build web --release',
      `-t ${app.target}`,
      `--output ${app.out}`,
      `--dart-define=SUPABASE_URL=${backend.url}`,
      `--dart-define=SUPABASE_ANON_KEY=${backend.key}`,
    ].join(' '),
    { stdio: 'inherit', cwd: import.meta.dirname },
  );

  // Give each build its own identity so the three install side by side.
  const manifestPath = path.join(import.meta.dirname, app.out, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  Object.assign(manifest, {
    name: app.name,
    short_name: app.short,
    description: app.description,
    theme_color: app.theme,
    background_color: app.background,
    display: 'standalone',
    orientation: 'portrait-primary',
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const title = path.join(import.meta.dirname, app.out, 'index.html');
  fs.writeFileSync(
    title,
    fs
      .readFileSync(title, 'utf8')
      .replace(/<title>.*?<\/title>/, `<title>${app.name}</title>`)
      .replace(
        /<meta name="description" content=".*?">/,
        `<meta name="description" content="${app.description}">`,
      ),
  );
  console.log(`   manifest + title set to "${app.name}"`);
}

console.log(`\nAll three built against ${LOCAL ? 'LOCAL' : 'HOSTED'} Supabase.`);
