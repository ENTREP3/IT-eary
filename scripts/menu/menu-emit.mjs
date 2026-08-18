// Turns the transcribed recipes into exactly the rows the database wants,
// with every kitchen measure already converted into the unit each ingredient
// is stocked in.
import { writeFileSync } from 'node:fs';
import { ingredients, dishes, rice, riceIngredient, convert } from './menu-data.mjs';

const all = [...ingredients, riceIngredient];
const byId = new Map(all.map(([id, name, unit, cost]) => [id, { id, name, unit, cost }]));

// What one batch of every dish needs, so opening stock can be set to it.
const need = new Map();
const recipeRows = [];

for (const d of [...dishes, ...rice]) {
  for (const [ing, qty, unit] of d.items) {
    const it = byId.get(ing);
    const amount = Number(convert(qty, unit, it.unit).toFixed(4));
    recipeRows.push({ dish_id: d.id, inventory_id: ing, quantity: amount });
    need.set(ing, Math.max(need.get(ing) ?? 0, amount));
  }
}

const round = (n) => Number(n.toFixed(3));

const inventoryRows = all.map(([id, name, unit, cost]) => {
  const batch = need.get(id) ?? 0;
  return {
    id,
    name,
    unit,
    // Enough for one batch of whichever dish needs the most of it.
    stock: round(batch),
    // Top back up to a batch; warn at half, which is a shop's last chance to
    // buy before it cannot cook the dish at all.
    par_level: round(batch),
    reorder_at: round(batch / 2),
    cost_per_unit: cost,
  };
});

const dishRows = [...dishes, ...rice].map((d) => ({
  id: d.id,
  name: d.name,
  tagalog: d.tagalog,
  price: d.price,
  category: d.category,
  description: d.description,
  image: '',
  available: true,
  sold_today: 0,
  stock_count: null,
  batch_yield: d.yield ?? 10,
  featured: false,
}));

const categories = [...new Set(dishRows.map((d) => d.category))];

writeFileSync(
  process.argv[2],
  JSON.stringify({ categories, inventory: inventoryRows, dishes: dishRows, recipes: recipeRows }, null, 1),
);

console.log(`categories ${categories.length}: ${categories.join(', ')}`);
console.log(`inventory  ${inventoryRows.length}`);
console.log(`dishes     ${dishRows.length}`);
console.log(`recipe rows ${recipeRows.length}`);
