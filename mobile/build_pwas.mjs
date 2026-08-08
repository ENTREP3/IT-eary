// Builds all three mobile apps as installable PWAs.
//
//   node build_pwas.mjs
//
// The backend is the hosted Supabase project, the same one the React app and
// the Android build talk to. There is deliberately no local option: a build
// that quietly points at a second database is how the apps end up disagreeing
// about what the data is.
//
// Flutter shares one web/ folder across every target, so all three builds would
// otherwise ship the same manifest and be indistinguishable once installed —
// same name, same icon, three tiles you can't tell apart. Each output's
// manifest.json is rewritten afterwards so they install as separate apps.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Not `import.meta.dirname`: that landed in Node 20, and the Flutter image this
// runs in inside Docker ships Node 18, where it is silently undefined. The
// three web builds all succeeded and then the manifest rewrite crashed on it.
const HERE = path.dirname(fileURLToPath(import.meta.url));

const backend = {
  url: 'https://tgazemsmihvodammodfu.supabase.co',
  key: 'sb_publishable_B3mvYfF2pMn2owzwGoHR8Q_Wx74GB7R',
};

const apps = [
  {
    target: 'lib/main_customer.dart',
    out: 'build/customer',
    base: '/customer/',
    name: 'Bencris',
    short: 'Bencris',
    description: "Order from the karinderya's live menu and hold your ticket.",
    theme: '#F4EAD5',
    background: '#F4EAD5',
  },
  {
    target: 'lib/main_cashier.dart',
    out: 'build/cashier',
    base: '/cashier/',
    name: 'Bencris Counter',
    short: 'Counter',
    description: 'Look up a ticket, check the payment, settle it.',
    theme: '#0F1410',
    background: '#0F1410',
  },
  {
    target: 'lib/main_admin.dart',
    out: 'build/admin',
    base: '/admin/',
    name: 'Bencris Operations',
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
      // The three are served side by side under one host, so each needs to know
      // the folder it lives in or every asset request would resolve to the root.
      `--base-href ${app.base}`,
      `--dart-define=SUPABASE_URL=${backend.url}`,
      `--dart-define=SUPABASE_ANON_KEY=${backend.key}`,
    ].join(' '),
    { stdio: 'inherit', cwd: HERE },
  );

  // Give each build its own identity so the three install side by side.
  const manifestPath = path.join(HERE, app.out, 'manifest.json');
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

  const title = path.join(HERE, app.out, 'index.html');
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

console.log(`\nAll three built against ${backend.url}`);
