// Verifies the GCash proof-of-payment feature against the local Supabase stack:
// the diner's declared payment method, the private proof bucket and its RLS, the
// three cashier outcomes, owner reconciliation, and the analytics regression
// guard.
import { URL, ANON, fresh, staff, announce } from './lib/backend.mjs';

announce("GCash payment proof upload and review");


let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; console.log(`${cond ? '✅' : '❌'} ${msg}`); };

// Smallest valid PNG, stands in for a GCash screenshot.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);


const anonCanRead = async (path) => {
  const { data, error } = await fresh().storage.from('payment-proofs').download(path);
  return !error && !!data;
};

// ---------------------------------------------------------------------------
// 1. The diner declares a payment method at checkout.
// ---------------------------------------------------------------------------
const { data: ticket, error: tErr } = await fresh().rpc('create_ticket', {
  p_items: [{ id: 'tapsilog', qty: 1 }],
  p_customer_name: 'Proof Test',
  p_payment_method: 'gcash',
});
check(!tErr && ticket, `diner created a GCash ticket (${tErr?.message ?? ticket?.ticket_code})`);
check(ticket?.payment_method === 'gcash', `method captured at checkout (${ticket?.payment_method})`);
check(ticket?.payment_status === 'unpaid', `starts unpaid (${ticket?.payment_status})`);

// ---------------------------------------------------------------------------
// 2. Upload the receipt, then record it against the order.
// ---------------------------------------------------------------------------

let proofPath = `${ticket.ticket_code}/receipt.png`;
{
  const { error } = await fresh().storage
    .from('payment-proofs')
    .upload(proofPath, PNG, { contentType: 'image/png', upsert: true });
  check(!error, `diner uploaded a receipt to their own ticket folder (${error?.message ?? 'ok'})`);

  const { data, error: atErr } = await fresh().rpc('attach_payment_proof', {
    p_ticket_code: ticket.ticket_code, p_path: proofPath,
  });
  check(!atErr && data?.proof_path === proofPath, `receipt recorded on the order (${atErr?.message ?? 'ok'})`);
  check(!!data?.proof_uploaded_at, 'proof_uploaded_at stamped');
}

// ---------------------------------------------------------------------------
// 3. Bucket boundaries.
// ---------------------------------------------------------------------------
{
  const { error } = await fresh().storage
    .from('payment-proofs')
    .upload('ZZZZZZ/hack.png', PNG, { contentType: 'image/png' });
  check(!!error, `anon cannot upload against a non-existent ticket (${error?.message ?? 'ALLOWED — BAD'})`);

  const { error: xErr } = await fresh().rpc('attach_payment_proof', {
    p_ticket_code: ticket.ticket_code, p_path: 'SOMEONEELSE/receipt.png',
  });
  check(!!xErr, 'a proof path from another ticket is rejected');
}

// ---------------------------------------------------------------------------
// 3b. THE ENUMERATION ATTACK.
//     A row-level read policy also makes list('') return folder names — i.e.
//     the ticket codes of unpaid orders — which an attacker holding only the
//     publishable key could then walk to download each receipt. Gating the read
//     on `proof_path IS NULL` closes this the moment the proof is recorded.
// ---------------------------------------------------------------------------
{
  const { data: victim } = await fresh().rpc('create_ticket', {
    p_items: [{ id: 'adobo', qty: 1 }], p_payment_method: 'gcash',
  });
  const vPath = `${victim.ticket_code}/receipt.png`;
  await fresh().storage.from('payment-proofs')
    .upload(vPath, PNG, { contentType: 'image/png', upsert: true });
  await fresh().rpc('attach_payment_proof', {
    p_ticket_code: victim.ticket_code, p_path: vPath,
  });

  const { data: root } = await fresh().storage.from('payment-proofs').list('');
  check((root ?? []).length === 0,
    `attacker cannot enumerate ticket folders (saw ${(root ?? []).length})`);

  const { data: inside } = await fresh().storage.from('payment-proofs').list(victim.ticket_code);
  check((inside ?? []).length === 0,
    `attacker cannot list inside a known ticket folder (saw ${(inside ?? []).length})`);

  check(!(await anonCanRead(vPath)),
    'attacker cannot download a recorded receipt even knowing its exact path');
}

// ---------------------------------------------------------------------------
// 3c. Replacing a blurry screenshot still works.
// ---------------------------------------------------------------------------
{
  const { error: cErr } = await fresh().rpc('clear_payment_proof', {
    p_ticket_code: ticket.ticket_code,
  });
  check(!cErr, `diner can clear a proof to re-upload (${cErr?.message ?? 'ok'})`);

  const second = `${ticket.ticket_code}/receipt-2.png`;
  const { error: upErr } = await fresh().storage.from('payment-proofs')
    .upload(second, PNG, { contentType: 'image/png' });
  check(!upErr, `diner can upload a replacement (${upErr?.message ?? 'ok'})`);

  const { data, error } = await fresh().rpc('attach_payment_proof', {
    p_ticket_code: ticket.ticket_code, p_path: second,
  });
  check(!error && data?.proof_path === second, `replacement recorded (${error?.message ?? 'ok'})`);
  proofPath = second;
}

// ---------------------------------------------------------------------------
// 4. Cashier settles it after seeing the proof.
// ---------------------------------------------------------------------------
const cashier = await staff('cashier');
{
  const { data, error } = await cashier.storage.from('payment-proofs').createSignedUrl(proofPath, 60);
  check(!error && data?.signedUrl, `cashier can sign a proof URL (${error?.message ?? 'ok'})`);

  const { data: paid, error: pErr } = await cashier.rpc('mark_ticket_paid', {
    p_ticket_code: ticket.ticket_code, p_method: 'gcash',
    p_status: 'verified', p_in_person: false, p_note: null,
  });
  check(!pErr && paid?.payment_status === 'verified', `cashier verified the payment (${pErr?.message ?? 'ok'})`);
}

// ---------------------------------------------------------------------------
// 5. Settling closes anonymous access to the receipt for good.
// ---------------------------------------------------------------------------
{
  check(!(await anonCanRead(proofPath)), 'anon LOSES access to the receipt once the ticket is settled');
  const { data, error } = await cashier.storage.from('payment-proofs').download(proofPath);
  check(!error && !!data, `cashier can still read the settled receipt (${error?.message ?? 'ok'})`);
}

// ---------------------------------------------------------------------------
// 6. The no-loss path: release & flag, then owner reconciliation.
// ---------------------------------------------------------------------------
{
  const { data: t2 } = await fresh().rpc('create_ticket', {
    p_items: [{ id: 'halohalo', qty: 1 }], p_customer_name: 'No proof', p_payment_method: 'gcash',
  });

  const { data, error } = await cashier.rpc('mark_ticket_paid', {
    p_ticket_code: t2.ticket_code, p_method: 'gcash',
    p_status: 'needs_review', p_in_person: false, p_note: 'Diner says sent, no screenshot',
  });
  check(!error && data?.payment_status === 'needs_review', `cashier can release & flag (${error?.message ?? 'ok'})`);
  check(data?.status === 'paid', 'a flagged order still reaches the kitchen — the diner is not blocked');

  const { error: cErr } = await cashier.rpc('resolve_payment_review', {
    p_ticket_code: t2.ticket_code, p_verified: true,
  });
  check(!!cErr, 'cashier cannot resolve a flagged payment (owner only)');

  const admin = await staff('admin');
  const { data: res, error: rErr } = await admin.rpc('resolve_payment_review', {
    p_ticket_code: t2.ticket_code, p_verified: true, p_note: 'Found in GCash history',
  });
  check(!rErr && res?.payment_status === 'verified', `owner resolved the flag (${rErr?.message ?? 'ok'})`);
}

// ---------------------------------------------------------------------------
// 7. Cashier may switch a GCash ticket to cash at the counter.
// ---------------------------------------------------------------------------
{
  const { data: t3 } = await fresh().rpc('create_ticket', {
    p_items: [{ id: 'pinakbet', qty: 1 }], p_payment_method: 'gcash',
  });
  const { data, error } = await cashier.rpc('mark_ticket_paid', {
    p_ticket_code: t3.ticket_code, p_method: 'cash', p_status: 'verified',
  });
  check(!error && data?.payment_method === 'cash', `cashier switched GCash → cash (${error?.message ?? 'ok'})`);
}

// ---------------------------------------------------------------------------
// 8. REGRESSION GUARD — payment mix must ignore unpaid intentions.
//    payment_method is now set at checkout, so the old
//    `payment_method is not null` filter would count every unplaced order.
// ---------------------------------------------------------------------------
{
  const admin = await staff('admin');
  await fresh().rpc('create_ticket', { p_items: [{ id: 'halohalo', qty: 1 }], p_payment_method: 'gcash' });

  const { data: mix } = await admin.rpc('admin_payment_mix', { p_days: 7 });
  const counted = (mix ?? []).reduce((a, r) => a + Number(r.order_count), 0);
  const { count: settled } = await admin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .not('paid_at', 'is', null)
    .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
  check(counted === settled, `payment mix counts only settled orders (${counted} vs ${settled} settled)`);

  const { data: usage, error: uErr } = await admin.rpc('storage_usage');
  check(!uErr && Array.isArray(usage), `owner can read storage usage (${uErr?.message ?? JSON.stringify(usage)})`);

  const { error: cErr } = await cashier.rpc('storage_usage');
  check(!!cErr, 'cashier cannot read storage usage (owner only)');
}

console.log('\n' + (failures === 0
  ? '🎉 All proof-of-payment checks passed.'
  : `⚠️  ${failures} check(s) failed.`));
process.exit(failures === 0 ? 0 : 1);
