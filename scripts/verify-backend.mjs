// End-to-end backend verification against the local Supabase stack.
// Mirrors exactly what the frontend does via @supabase/supabase-js.
//
// Covers the ticket-based ordering model: anonymous diners create tickets via
// create_ticket(), staff settle them via mark_ticket_paid(), and neither the
// diner nor a tampered client can write to `orders` directly.
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:55321';
const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const log = (ok, msg) => console.log(`${ok ? '✅' : '❌'} ${msg}`);
let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; log(cond, msg); };

const fresh = () => createClient(URL, ANON, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// 1. Anonymous diners can create a ticket — no account involved.
// ---------------------------------------------------------------------------
let ticket = null;
{
  const sb = fresh();
  const { data, error } = await sb.rpc('create_ticket', {
    p_items: [{ id: 'tapsilog', qty: 2 }, { id: 'sago', qty: 1 }],
    p_customer_name: 'Juan',
  });
  check(!error && data, `anon created a ticket (${error?.message ?? 'ok'})`);
  ticket = data;
  check(/^[2-9A-HJ-NP-Z]{6}$/.test(ticket?.ticket_code ?? ''), `ticket code looks right (${ticket?.ticket_code})`);
  check(ticket?.status === 'pending', `new ticket starts unpaid (status='${ticket?.status}')`);
  // The diner now declares a method at checkout (defaulting to cash); it is
  // payment_status that stays 'unpaid' until a cashier settles the ticket.
  check(ticket?.payment_method === 'cash', `defaults to cash when unspecified (got '${ticket?.payment_method}')`);
  check(ticket?.payment_status === 'unpaid', `payment not yet confirmed (got '${ticket?.payment_status}')`);
}

// ---------------------------------------------------------------------------
// 2. SECURITY: prices come from the DB, never the client.
//    A tampered client sends a ₱1 price for a ₱75 dish; the stored total must
//    still be the real menu price.
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { data } = await sb.rpc('create_ticket', {
    p_items: [{ id: 'tapsilog', qty: 1, price: 1, name: 'Free lunch' }],
    p_customer_name: null,
  });
  check(Number(data?.total) === 75, `client-sent price ignored, server priced it (total=${data?.total}, expected 75)`);
  check(data?.items?.[0]?.name === 'Tapsilog', `client-sent name ignored (got '${data?.items?.[0]?.name}')`);
}

// ---------------------------------------------------------------------------
// 3. Unavailable dishes are rejected (kaldereta is seeded available=false).
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { error } = await sb.rpc('create_ticket', {
    p_items: [{ id: 'kaldereta', qty: 1 }],
    p_customer_name: null,
  });
  check(!!error, 'sold-out dish cannot be ticketed');
}

// ---------------------------------------------------------------------------
// 4. Anonymous users cannot write to `orders` directly — RPC is the only path.
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { error: insErr } = await sb.from('orders').insert({
    reference: 'HACK01', ticket_code: 'HACK01', items: [], total: 1,
  });
  check(!!insErr, 'anon CANNOT insert an order directly');

  const { error: updErr, count } = await sb
    .from('orders')
    .update({ status: 'paid', total: 0 }, { count: 'exact' })
    .eq('ticket_code', ticket.ticket_code);
  check(!!updErr || count === 0, 'anon CANNOT update an order');

  const { error: payErr } = await sb.rpc('mark_ticket_paid', {
    p_ticket_code: ticket.ticket_code, p_method: 'cash',
  });
  check(!!payErr, 'anon CANNOT mark a ticket paid');
}

// ---------------------------------------------------------------------------
// 5. Anonymous diner can read their own ticket back (status tracking).
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { data } = await sb.from('orders').select('*').eq('ticket_code', ticket.ticket_code).maybeSingle();
  check(data?.ticket_code === ticket.ticket_code, 'anon can look up their ticket by code');
}

// ---------------------------------------------------------------------------
// 6. Cashier: sign in, look the ticket up, settle it.
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { data: signin, error } = await sb.auth.signInWithPassword({
    email: 'cashier@bencris.local', password: 'cashier123',
  });
  check(!error, `cashier signIn (${error?.message ?? 'ok'})`);

  const { data: prof } = await sb.from('profiles').select('role').eq('id', signin.user.id).single();
  check(prof?.role === 'cashier', `cashier profile role is 'cashier' (got '${prof?.role}')`);

  const { data: found } = await sb.from('orders').select('*').eq('ticket_code', 'PAY001').maybeSingle();
  check(found?.ticket_code === 'PAY001', 'cashier can look up a seeded unpaid ticket');

  const { data: paid, error: payErr } = await sb.rpc('mark_ticket_paid', {
    p_ticket_code: ticket.ticket_code, p_method: 'cash',
  });
  check(!payErr && paid?.status === 'paid', `cashier settled the ticket (${payErr?.message ?? 'ok'})`);
  check(paid?.payment_method === 'cash', `payment method recorded (got '${paid?.payment_method}')`);
  check(!!paid?.paid_at, 'paid_at timestamp set');
  check(paid?.paid_by === signin.user.id, 'paid_by records which cashier took the money');

  // Double payment must be refused.
  const { error: dupErr } = await sb.rpc('mark_ticket_paid', {
    p_ticket_code: ticket.ticket_code, p_method: 'gcash',
  });
  check(!!dupErr, 'paying an already-paid ticket is refused');

  // Unknown ticket must be refused.
  const { error: missErr } = await sb.rpc('mark_ticket_paid', {
    p_ticket_code: 'ZZZZZZ', p_method: 'cash',
  });
  check(!!missErr, 'unknown ticket code is refused');
}

// ---------------------------------------------------------------------------
// 7. Cashier is NOT an admin — must not reach admin-only data.
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  await sb.auth.signInWithPassword({ email: 'cashier@bencris.local', password: 'cashier123' });

  const { data: exp } = await sb.from('expenses').select('id');
  check((exp ?? []).length === 0, 'cashier cannot read admin-only expenses');

  const { error: menuErr, count } = await sb
    .from('dishes')
    .update({ price: 1 }, { count: 'exact' })
    .eq('id', 'tapsilog');
  check(!!menuErr || count === 0, 'cashier cannot change menu prices');
}

// ---------------------------------------------------------------------------
// 8. Admin: full visibility + settings, and the payment-mix RPC still works.
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'admin@bencris.local', password: 'admin123',
  });
  check(!error, `admin signIn (${error?.message ?? 'ok'})`);

  const { data: prof } = await sb.from('profiles').select('role').eq('id', data.user.id).single();
  check(prof?.role === 'admin', `admin profile role is 'admin' (got '${prof?.role}')`);

  // Admin sees everything, including orders older than the 24h anon window.
  const { data: all } = await sb.from('orders').select('ticket_code');
  check((all?.length ?? 0) >= 13, `admin sees all orders (count=${all?.length})`);

  const { error: upErr } = await sb.from('payment_settings')
    .update({ gcash_number: '0917 555 0123', gcash_name: 'K-MARY Karinderya' }).eq('id', 1);
  check(!upErr, `admin updated payment_settings (${upErr?.message ?? 'ok'})`);

  const { data: mix, error: mixErr } = await sb.rpc('admin_payment_mix', { p_days: 7 });
  check(!mixErr && Array.isArray(mix) && mix.length > 0, `admin_payment_mix RPC (${mixErr?.message ?? JSON.stringify(mix)})`);
}

// ---------------------------------------------------------------------------
// 9. Anon exposure is bounded to the 24h window (the accepted trade-off).
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { data } = await sb.from('orders').select('ticket_code, created_at');
  const stale = (data ?? []).filter(
    (o) => Date.now() - new Date(o.created_at).getTime() > 24 * 60 * 60 * 1000,
  );
  check(stale.length === 0, `anon sees only recent orders (${stale.length} older than 24h leaked)`);
  check(!(data ?? []).some((o) => o.ticket_code === 'X4B9LM'), 'anon cannot see a 2-day-old order');
}

console.log('\n' + (failures === 0 ? '🎉 All backend checks passed.' : `⚠️  ${failures} check(s) failed.`));
process.exit(failures === 0 ? 0 : 1);
