// Costs every recipe from the ingredient prices and compares with what the
// owner wrote, so any conversion I got wrong shows up as a gap.
import { ingredients, dishes, rice, riceIngredient, convert } from './menu-data.mjs';

const all = [...ingredients, riceIngredient];
const byId = new Map(all.map(([id, name, unit, cost]) => [id, { id, name, unit, cost }]));

const peso = (n) => '₱' + n.toFixed(2).padStart(8);

let bad = 0;
console.log('DISH                            written   computed      gap   price  cost/serv  margin');
console.log('─'.repeat(88));

const need = new Map(); // ingredient -> units for one batch of everything

for (const d of [...dishes, ...rice]) {
  let cost = 0;
  for (const [ing, qty, unit] of d.items) {
    const it = byId.get(ing);
    if (!it) { console.log(`  !! unknown ingredient ${ing} in ${d.id}`); bad++; continue; }
    let inUnit;
    try { inUnit = convert(qty, unit, it.unit); }
    catch (e) { console.log(`  !! ${d.id}: ${e.message}`); bad++; continue; }
    cost += inUnit * it.cost;
    need.set(ing, Math.max(need.get(ing) ?? 0, inUnit));
  }

  const servings = d.yield ?? 10;
  const perServing = cost / servings;
  const margin = ((d.price - perServing) / d.price) * 100;
  const gap = d.written ? cost - d.written : 0;

  console.log(
    d.name.padEnd(30) +
    (d.written ? peso(d.written) : '       —') +
    peso(cost) +
    (d.written ? (gap >= 0 ? '+' : '') + gap.toFixed(0).padStart(8) : '       —') +
    ('₱' + d.price).padStart(8) +
    peso(perServing).padStart(11) +
    (margin.toFixed(0) + '%').padStart(8),
  );
}

console.log('\n' + '─'.repeat(88));
console.log(`${byId.size} ingredients, ${dishes.length} dishes + ${rice.length} rice entries`);
console.log(`unresolved problems: ${bad}`);

console.log('\nOPENING STOCK — enough for one batch of every dish that uses it:');
const rows = [...need.entries()].map(([id, q]) => {
  const it = byId.get(id);
  return `  ${it.name.padEnd(30)} ${q.toFixed(3).padStart(9)} ${it.unit.padEnd(6)} @ ₱${it.cost}`;
});
console.log(rows.slice(0, 6).join('\n'));
console.log(`  … and ${rows.length - 6} more`);
