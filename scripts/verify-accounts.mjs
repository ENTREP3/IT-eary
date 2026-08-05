// End-to-end checks for optional customer accounts, order status, ratings,
// loyalty and the recipe-driven inventory.
//
// Run with the local stack up:  node scripts/verify-accounts.mjs
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:55321';
const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const log = (ok, msg) => console.log(`${ok ? '✅' : '❌'} ${msg}`);
let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; log(cond, msg); };

const fresh = () => createClient(URL, ANON, { auth: { persistSession: false } });

const staff = async (email, password) => {
  const sb = fresh();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sb;
};

// ---------------------------------------------------------------------------
// 1. Guest ordering still works, with no account anywhere.
// ---------------------------------------------------------------------------
{
  const sb = fresh();
  const { data, error } = await sb.rpc('create_ticket', {
    p_items: [{ id: 'tapsilog', qty: 1 }],
    p_customer_name: 'Walk-in',
  });
  check(!error && data, `a guest can still order with no account (${error?.message ?? 'ok'})`);
  check(data?.customer_id === null, 'a guest order belongs to nobody');
}

// ---------------------------------------------------------------------------
// 2. A customer signs up and their order is attached to them.
// ---------------------------------------------------------------------------
const email = `diner_${Date.now()}@example.com`;
const customer = fresh();
let myTicket = null;
{
  const { data, error } = await customer.auth.signUp({ email, password: 'diner12345' });
  check(!error && data.session, `a diner can create an account (${error?.message ?? 'ok'})`);

  const { data: profile } = await customer
    .from('profiles').select('role').eq('id', data.user.id).single();
  check(profile?.role === 'customer', `a new account is a customer, never staff (got '${profile?.role}')`);

  const { data: order, error: orderErr } = await customer.rpc('create_ticket', {
    p_items: [{ id: 'adobo', qty: 2 }],
    p_customer_name: 'Ana',
    p_pickup_at: new Date(Date.now() + 45 * 60_000).toISOString(),
  });
  check(!orderErr && order, `a signed-in diner can order (${orderErr?.message ?? 'ok'})`);
  check(order?.customer_id === data.user.id, 'the order is attached to their account');
  check(!!order?.pickup_at, 'the chosen pickup time is recorded');
  myTicket = order?.ticket_code;
}

// ---------------------------------------------------------------------------
// 3. Staff move the order through the kitchen. The cashier can do this too.
// ---------------------------------------------------------------------------
{
  const cashier = await staff('cashier@bencris.local', 'cashier123');

  const { error: earlyErr } = await cashier.rpc('advance_order_status', {
    p_ticket_code: myTicket, p_status: 'preparing',
  });
  check(!!earlyErr, 'cooking cannot start before the ticket is settled');

  await cashier.rpc('mark_ticket_paid', { p_ticket_code: myTicket, p_method: 'cash' });

  for (const status of ['preparing', 'ready', 'completed']) {
    const { error } = await cashier.rpc('advance_order_status', {
      p_ticket_code: myTicket, p_status: status,
    });
    check(!error, `the cashier can set the order to ${status} (${error?.message ?? 'ok'})`);
  }

  const { error: cancelErr } = await cashier.rpc('advance_order_status', {
    p_ticket_code: myTicket, p_status: 'cancelled',
  });
  check(!!cancelErr, 'only the owner may cancel an order');
}

// ---------------------------------------------------------------------------
// 4. The customer sees their own order, and only their own.
// ---------------------------------------------------------------------------
{
  const { data: mine } = await customer.from('orders').select('ticket_code, status');
  check(
    mine?.some((o) => o.ticket_code === myTicket && o.status === 'completed'),
    'the diner sees their finished order on their own page',
  );

  const { data: loyalty } = await customer.rpc('my_loyalty');
  const row = Array.isArray(loyalty) ? loyalty[0] : loyalty;
  check(row?.completed === 1, `loyalty counts completed orders (got ${row?.completed})`);
  check(row?.until_next === 4, `four more orders until a reward (got ${row?.until_next})`);

  const { error: tooSoon } = await customer.rpc('claim_loyalty_reward');
  check(!!tooSoon, 'a reward cannot be claimed before it is earned');
}

// ---------------------------------------------------------------------------
// 5. Ratings: only a settled ticket that contained the dish may leave one.
// ---------------------------------------------------------------------------
{
  const { error: wrongDish } = await customer.rpc('leave_review', {
    p_ticket_code: myTicket, p_dish_id: 'sago', p_rating: 5,
  });
  check(!!wrongDish, 'cannot rate a dish that was not on the ticket');

  const { error: rateErr } = await customer.rpc('leave_review', {
    p_ticket_code: myTicket, p_dish_id: 'adobo', p_rating: 5, p_comment: 'Sarap!',
  });
  check(!rateErr, `a real buyer can rate the dish they bought (${rateErr?.message ?? 'ok'})`);

  const anon = fresh();
  const { data: unpaid } = await anon.rpc('create_ticket', { p_items: [{ id: 'adobo', qty: 1 }] });
  const { error: unpaidErr } = await anon.rpc('leave_review', {
    p_ticket_code: unpaid.ticket_code, p_dish_id: 'adobo', p_rating: 5,
  });
  check(!!unpaidErr, 'an unpaid ticket cannot leave a rating');

  const { data: ratings } = await anon.from('dish_ratings').select('*').eq('dish_id', 'adobo').single();
  check(Number(ratings?.total) >= 1, 'the average is published for everyone to read');
}

// ---------------------------------------------------------------------------
// 6. Cooking a batch draws its ingredients out of the inventory.
// ---------------------------------------------------------------------------
{
  const owner = await staff('admin@bencris.local', 'admin123');

  const before = await owner.from('inventory').select('stock').eq('id', 'pork').single();
  const batches = await owner.rpc('can_cook', { p_dish_id: 'sinigang' });
  check(Number(batches.data) > 0, `the kitchen can still cook sinigang (${batches.data} batches)`);

  const { error: cookErr } = await owner.rpc('cook_batch', { p_dish_id: 'sinigang', p_batches: 1 });
  check(!cookErr, `the owner can record cooking a batch (${cookErr?.message ?? 'ok'})`);

  const after = await owner.from('inventory').select('stock').eq('id', 'pork').single();
  check(
    Number(after.data.stock) === Number(before.data.stock) - 1.5,
    `cooking drew the pork down by the recipe amount (${before.data.stock} to ${after.data.stock})`,
  );

  const cashier = await staff('cashier@bencris.local', 'cashier123');
  const { error: notOwner } = await cashier.rpc('cook_batch', { p_dish_id: 'sinigang', p_batches: 1 });
  check(!!notOwner, 'only the owner may record cooking');

  const { error: tooMany } = await owner.rpc('cook_batch', { p_dish_id: 'sinigang', p_batches: 999 });
  check(!!tooMany, 'cooking is refused when an ingredient would run out');
}

console.log(
  failures === 0
    ? '\n🎉 All account, status, rating and recipe checks passed.'
    : `\n${failures} check(s) failed.`,
);
process.exitCode = failures === 0 ? 0 : 1;
