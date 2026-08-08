// End-to-end checks for optional customer accounts, order status, ratings,
// loyalty and the recipe-driven inventory.
//
// Run with the local stack up:  node scripts/verify-accounts.mjs
import { URL, fresh, staff, announce, ADMIN_EMAIL, ADMIN_PASSWORD, CASHIER_EMAIL, CASHIER_PASSWORD } from './lib/backend.mjs';

announce("Customer accounts, order status, ratings, loyalty and recipes");


const log = (ok, msg) => console.log(`${ok ? '✅' : '❌'} ${msg}`);
let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; log(cond, msg); };



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
  const cashier = await staff('cashier');

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
  const owner = await staff('admin');

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

  const cashier = await staff('cashier');
  const { error: notOwner } = await cashier.rpc('cook_batch', { p_dish_id: 'sinigang', p_batches: 1 });
  check(!!notOwner, 'only the owner may record cooking');

  const { error: tooMany } = await owner.rpc('cook_batch', { p_dish_id: 'sinigang', p_batches: 999 });
  check(!!tooMany, 'cooking is refused when an ingredient would run out');
}

// ---------------------------------------------------------------------------
// 7. The owner can change the shop's own details, and nobody else can.
// ---------------------------------------------------------------------------
{
  const owner = await staff('admin');
  const anon = fresh();

  const original = (await anon.from('business_settings').select('phone').single()).data.phone;

  const { error: ownerErr } = await owner
    .from('business_settings').update({ phone: '0917 000 0000' }).eq('id', 1);
  check(!ownerErr, `the owner can change the shop details (${ownerErr?.message ?? 'ok'})`);

  const seen = (await anon.from('business_settings').select('phone').single()).data.phone;
  check(seen === '0917 000 0000', 'the change is immediately visible to customers');

  // A blocked write returns success with zero rows, so read it back rather
  // than trusting the absence of an error.
  await anon.from('business_settings').update({ phone: 'HACKED' }).eq('id', 1);
  const after = (await anon.from('business_settings').select('phone').single()).data.phone;
  check(after === '0917 000 0000', 'an anonymous visitor cannot change the shop details');

  await owner.from('business_settings').update({ phone: original }).eq('id', 1);
}

// ---------------------------------------------------------------------------
// 8. Staff administration, including the guard against locking the shop out.
// ---------------------------------------------------------------------------
{
  const owner = await staff('admin');
  const cashier = await staff('cashier');

  const { data: list, error: listErr } = await owner.rpc('list_staff');
  check(!listErr && list?.length >= 2, `the owner can see who has staff access (${list?.length} accounts)`);

  const { error: cashierErr } = await cashier.rpc('list_staff');
  check(!!cashierErr, 'a cashier cannot see the staff list');

  const { error: lastOwner } = await owner.rpc('revoke_staff', { target_email: ADMIN_EMAIL });
  check(!!lastOwner, 'the only owner cannot have their own access removed');

  const { error: reviewsErr, data: reviews } = await owner.rpc('all_reviews');
  check(!reviewsErr && Array.isArray(reviews), 'the owner can read every rating for moderation');
}

// ---------------------------------------------------------------------------
// 9. Every dish on the menu is linked to the inventory.
// ---------------------------------------------------------------------------
{
  const anon = fresh();
  const { data: dishes } = await anon.from('dishes').select('id, name');
  const { data: recipes } = await anon.from('recipe_items').select('dish_id');
  const withRecipe = new Set((recipes ?? []).map((r) => r.dish_id));
  const missing = (dishes ?? []).filter((d) => !withRecipe.has(d.id));
  check(
    missing.length === 0,
    missing.length === 0
      ? `all ${dishes.length} dishes deduct ingredients when cooked`
      : `no recipe for: ${missing.map((d) => d.name).join(', ')}`,
  );
}

console.log(
  failures === 0
    ? '\n🎉 All account, status, rating, recipe and owner checks passed.'
    : `\n${failures} check(s) failed.`,
);
process.exitCode = failures === 0 ? 0 : 1;
