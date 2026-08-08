// The one place a script decides which backend it is talking to.
//
// There is exactly one database for this system: the hosted Supabase project.
// The scripts used to hardcode the local Docker stack, which meant "the checks
// passed" and "the app works" could be true of two different databases at once.
// They now read the same .env.local the web app reads, so that cannot happen.
//
// Staff credentials come from the environment because staff accounts are real
// rows created by the owner, not fixtures. Nothing is hardcoded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnvFile('.env.local'), ...process.env };

export const URL = env.VITE_SUPABASE_URL;
export const ANON = env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('No backend configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
  process.exit(1);
}

export const ADMIN_EMAIL = env.CHECK_ADMIN_EMAIL;
export const ADMIN_PASSWORD = env.CHECK_ADMIN_PASSWORD;
export const CASHIER_EMAIL = env.CHECK_CASHIER_EMAIL;
export const CASHIER_PASSWORD = env.CHECK_CASHIER_PASSWORD;

export const fresh = () => createClient(URL, ANON, { auth: { persistSession: false } });

/**
 * Signs in as a staff member, or explains what is missing.
 *
 * These scripts write real rows — tickets, ratings, inventory movements — into
 * whatever backend they are pointed at. Announcing the target up front is the
 * difference between a test run and a surprise in the owner's sales figures.
 */
export async function staff(role) {
  const email = role === 'admin' ? ADMIN_EMAIL : CASHIER_EMAIL;
  const password = role === 'admin' ? ADMIN_PASSWORD : CASHIER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      `No ${role} credentials. These scripts sign in as real staff accounts, so set ` +
        `CHECK_${role === 'admin' ? 'ADMIN' : 'CASHIER'}_EMAIL and ` +
        `CHECK_${role === 'admin' ? 'ADMIN' : 'CASHIER'}_PASSWORD before running them.`,
    );
  }

  const sb = fresh();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sb;
}

export function announce(what) {
  console.log(`${what}\n  backend: ${URL}\n  writes real rows into that database.\n`);
}
