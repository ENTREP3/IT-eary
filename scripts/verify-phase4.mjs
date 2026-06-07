// Verifies the Phase 4 additions: menu/inventory/expenses in Postgres, RLS,
// and the order-fulfillment trigger (sold_today ++ / stock_count --).
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:55321';
const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; console.log(`${cond ? '✅' : '❌'} ${msg}`); };
const fresh = () => createClient(URL, ANON, { auth: { persistSession: false } });

// --- public menu reads (anon) ---
{
  const sb = fresh();
  const { data: dishes } = await sb.from('dishes').select('*');
  const { data: cats } = await sb.from('categories').select('*');
  check((dishes?.length ?? 0) >= 9, `anon reads menu dishes (count=${dishes?.length})`);
  check((cats?.length ?? 0) >= 4, `anon reads categories (count=${cats?.length})`);
}

// --- inventory is admin-only (anon blocked) ---
{
  const sb = fresh();
  const { data, error } = await sb.from('inventory').select('*');
  check(!!error || (data?.length ?? 0) === 0, `anon CANNOT read inventory (${error?.code ?? 'empty'})`);
}

// --- customer + admin clients ---
const cust = fresh();
const email = `diner_${Date.now()}@test.local`;
await cust.auth.signUp({ email, password: 'secret123', options: { data: { full_name: 'Test Diner' } } });
const { data: cu } = await cust.auth.getUser();

const admin = fresh();
await admin.auth.signInWithPassword({ email: 'admin@iteary.local', password: 'admin123' });

// --- trigger: ordering bumps dishes.sold_today ---
{
  const { data: before } = await admin.from('dishes').select('sold_today').eq('id', 'adobo').single();
  await cust.from('orders').insert({
    reference: 'KMT' + Math.floor(Math.random() * 900000 + 100000),
    customer_id: cu.user.id, customer_name: 'Test Diner',
    items: [{ id: 'adobo', name: 'Chicken Adobo', qty: 2, price: 85 }],
    total: 170, payment_method: 'cash', status: 'pending',
  });
  const { data: after } = await admin.from('dishes').select('sold_today').eq('id', 'adobo').single();
  check(after.sold_today === before.sold_today + 2, `sold_today incremented by trigger (${before.sold_today} -> ${after.sold_today})`);
}

// --- trigger: stock_count decrements and auto sold-out at 0 ---
{
  await admin.from('dishes').update({ stock_count: 3, available: true }).eq('id', 'sago');
  await cust.from('orders').insert({
    reference: 'KMS' + Math.floor(Math.random() * 900000 + 100000),
    customer_id: cu.user.id, customer_name: 'Test Diner',
    items: [{ id: 'sago', name: "Sago't Gulaman", qty: 3, price: 25 }],
    total: 75, payment_method: 'gcash', status: 'paid',
  });
  const { data: sago } = await admin.from('dishes').select('stock_count, available').eq('id', 'sago').single();
  check(sago.stock_count === 0 && sago.available === false, `stock_count hit 0 and dish auto sold-out (stock=${sago.stock_count}, available=${sago.available})`);
}

// --- RLS: customer cannot write menu or expenses; admin can ---
{
  const { error: dishErr } = await cust.from('dishes').update({ price: 1 }).eq('id', 'adobo');
  const { data: adoboAfter } = await admin.from('dishes').select('price').eq('id', 'adobo').single();
  check(Number(adoboAfter.price) !== 1, `customer CANNOT edit dishes (price still ${adoboAfter.price})`);

  const { error: expErr } = await cust.from('expenses').insert({ label: 'hack', amount: 1 });
  check(!!expErr, `customer CANNOT add expenses (${expErr?.code ?? 'no error?!'})`);

  const { error: okErr } = await admin.from('expenses').insert({ label: 'Test expense', amount: 500, category: 'Supplies' });
  check(!okErr, `admin CAN add expenses (${okErr?.message ?? 'ok'})`);

  const { error: menuErr } = await admin.from('dishes').update({ available: true }).eq('id', 'adobo');
  check(!menuErr, `admin CAN edit dishes (${menuErr?.message ?? 'ok'})`);
}

console.log('\n' + (failures === 0 ? '🎉 Phase 4 backend checks passed.' : `⚠️  ${failures} check(s) failed.`));
process.exit(failures === 0 ? 0 : 1);
