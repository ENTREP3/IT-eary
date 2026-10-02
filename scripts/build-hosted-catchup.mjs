// Builds docs/hosted-catchup.sql: the migrations the hosted Supabase project is
// missing, as one script to paste into its SQL Editor.
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const OUT = path.join(ROOT, 'docs', 'hosted-catchup.sql');

/**
 * Verified against the live hosted project on 2026-08-06: everything up to and
 * including payment_proof is already applied there, so re-running it would fail
 * on "already exists". These are the ones it does not have.
 */
const MISSING = [
  '20260805000000_promotions.sql',
  '20260806000000_reviews.sql',
  '20260807000000_customer_accounts.sql',
  '20260808000000_recipes.sql',
  '20260810000000_business_settings.sql',
  '20260811000000_more_recipes.sql',
  '20260812000000_create_staff.sql',
  '20260813000000_inventory_par_levels.sql',
];

const parts = [];

parts.push(`-- ============================================================================
-- Bencris · Catch-up for the hosted Supabase project
-- ----------------------------------------------------------------------------

begin;
`);

for (const file of MISSING) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
  parts.push(`
-- ============================================================================
-- ${file}
-- ============================================================================
${sql.trimEnd()}
`);
}

// Record them the way the CLI would, so a later `supabase db push` from an
// account that CAN reach this project does not try to run them a second time.
parts.push(`
-- ---------------------------------------------------------------------------
-- Tell the CLI these are applied, so a future \`supabase db push\` skips them.
-- ---------------------------------------------------------------------------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);

insert into supabase_migrations.schema_migrations (version) values
${MISSING.map((f) => `  ('${f.split('_')[0]}')`).join(',\n')}
on conflict (version) do nothing;

commit;
`);

fs.writeFileSync(OUT, parts.join('\n'));

const bytes = fs.statSync(OUT).size;
console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(`${MISSING.length} migrations, ${(bytes / 1024).toFixed(1)} kB`);
console.log('\npaste it into the hosted project SQL Editor and run it.');
