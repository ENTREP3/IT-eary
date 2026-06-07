// End-to-end backend verification against the local Supabase stack.
// Mirrors exactly what the frontend does via @supabase/supabase-js.
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:55321';
const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const log = (ok, msg) => console.log(`${ok ? '✅' : '❌'} ${msg}`);
let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; log(cond, msg); };

const fresh = () => createClient(URL, ANON, { auth: { persistSession: false } });

const email = `diner_${Date.now()}@test.local`;
const password = 'secret123';

// 1. Customer registration -> profile auto-created as 'customer'
{
  const sb = fresh();
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: 'Juan Dela Cruz', phone: '0917 000 1111' } },
  });
  check(!error && data.user, `customer signUp (${error?.message ?? 'ok'})`);
  const { data: prof } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  check(prof?.role === 'customer', `new profile role is 'customer' (got '${prof?.role}')`);
  check(prof?.full_name === 'Juan Dela Cruz', 'profile full_name copied from signup metadata');
}

// 2. Privilege escalation must be blocked: a customer cannot self-promote to admin
{
  const sb = fresh();
  await sb.auth.signInWithPassword({ email, password });
  const { data: me } = await sb.auth.getUser();
  const { error } = await sb.from('profiles').update({ role: 'admin' }).eq('id', me.user.id);
  // Column-level grant blocks updating `role`; expect an error OR no change.
  const { data: after } = await sb.from('profiles').select('role').eq('id', me.user.id).single();
  check(after?.role === 'customer', `role escalation blocked (still '${after?.role}')`);
}

// 3. Customer can place an order tied to their account (RLS insert)
let placedRef = null;
{
  const sb = fresh();
  const { data: signin } = await sb.auth.signInWithPassword({ email, password });
  placedRef = 'KM' + Math.floor(Math.random() * 900000 + 100000);
  const { data, error } = await sb.from('orders').insert({
    reference: placedRef,
    customer_id: signin.user.id,
    customer_name: 'Juan Dela Cruz',
    items: [{ name: 'Tapsilog', qty: 1, price: 75 }],
    total: 75,
    payment_method: 'gcash',
    status: 'paid',
  }).select('*').single();
  check(!error && data, `customer placed order (${error?.message ?? 'ok'})`);
}

// 4. A customer must NOT see other people's orders, but sees their own
{
  const sb = fresh();
  await sb.auth.signInWithPassword({ email, password });
  const { data } = await sb.from('orders').select('reference');
  const refs = (data ?? []).map((o) => o.reference);
  check(refs.includes(placedRef), 'customer sees their own order');
  check(!refs.includes('KM100201'), "customer cannot see admin/seed orders (RLS)");
}

// 5. Admin login + role gate (what loginAdmin does)
{
  const sb = fresh();
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'admin@iteary.local', password: 'admin123',
  });
  check(!error, `admin signIn (${error?.message ?? 'ok'})`);
  const { data: prof } = await sb.from('profiles').select('role').eq('id', data.user.id).single();
  check(prof?.role === 'admin', `admin profile role is 'admin' (got '${prof?.role}')`);

  // Admin sees ALL orders (RLS admin branch)
  const { data: all } = await sb.from('orders').select('reference');
  check((all?.length ?? 0) >= 10, `admin sees all orders (count=${all?.length})`);

  // Admin can update payment settings
  const { error: upErr } = await sb.from('payment_settings')
    .update({ gcash_number: '0917 555 0123', gcash_name: 'K-MARY Karinderya' }).eq('id', 1);
  check(!upErr, `admin updated payment_settings (${upErr?.message ?? 'ok'})`);

  // Payment mix RPC (powers "How diners pay")
  const { data: mix, error: mixErr } = await sb.rpc('admin_payment_mix', { p_days: 7 });
  check(!mixErr && Array.isArray(mix) && mix.length > 0, `admin_payment_mix RPC (${mixErr?.message ?? JSON.stringify(mix)})`);
}

// 6. Anonymous (not logged in) can read payment settings but cannot insert orders
{
  const sb = fresh();
  const { data: ps } = await sb.from('payment_settings').select('gcash_number').eq('id', 1).single();
  check(!!ps?.gcash_number, 'anon can read payment settings (for checkout display)');
  const { error } = await sb.from('orders').insert({
    reference: 'KMANON1', items: [], total: 10, payment_method: 'cash',
  });
  check(!!error, 'anon CANNOT place an order (RLS enforced)');
}

console.log('\n' + (failures === 0 ? '🎉 All backend checks passed.' : `⚠️  ${failures} check(s) failed.`));
process.exit(failures === 0 ? 0 : 1);
