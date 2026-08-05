import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Dish, InventoryItem } from '../components/data';

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---- row <-> app-model mappers (DB is snake_case, app is camelCase) ---------
type DishRow = {
  id: string; name: string; tagalog: string; price: number; category: string;
  description: string; image: string; available: boolean; sold_today: number;
  stock_count: number | null;
};
type InvRow = {
  id: string; name: string; unit: string; stock: number; reorder_at: number;
  par_level: number; last_delivery: string; last_received_at: string | null;
};

const toDish = (r: DishRow): Dish => ({
  id: r.id, name: r.name, tagalog: r.tagalog, price: Number(r.price),
  category: r.category, description: r.description, image: r.image,
  available: r.available, soldToday: r.sold_today, stockCount: r.stock_count,
});
const toInv = (r: InvRow): InventoryItem => ({
  id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock),
  reorderAt: Number(r.reorder_at), parLevel: Number(r.par_level ?? 0),
  lastDelivery: r.last_delivery, lastReceivedAt: r.last_received_at,
});

function dishPatchToRow(patch: Partial<Dish>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.tagalog !== undefined) row.tagalog = patch.tagalog;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.image !== undefined) row.image = patch.image;
  if (patch.available !== undefined) row.available = patch.available;
  if (patch.soldToday !== undefined) row.sold_today = patch.soldToday;
  if (patch.stockCount !== undefined) row.stock_count = patch.stockCount;
  return row;
}

type KarinderyaState = {
  categories: string[];
  dishes: Dish[];
  inventory: InventoryItem[];
  loaded: boolean;

  loadAll: () => Promise<void>;
  subscribe: () => () => void;

  addCategory: (name: string) => Promise<boolean>;
  removeCategory: (name: string) => Promise<void>;
  addDish: (partial: Omit<Dish, 'id'> & { id?: string }) => Promise<string>;
  updateDish: (id: string, patch: Partial<Dish>) => Promise<void>;
  deleteDish: (id: string) => Promise<void>;
  addInventory: (partial: Omit<InventoryItem, 'id'> & { id?: string }) => Promise<string>;
  updateInventory: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  deleteInventory: (id: string) => Promise<void>;
};

async function fetchDishes() {
  const { data } = await supabase.from('dishes').select('*').order('created_at').order('name');
  return (data as DishRow[] | null)?.map(toDish) ?? [];
}
async function fetchCategories() {
  const { data } = await supabase.from('categories').select('name').order('name');
  return (data as { name: string }[] | null)?.map((c) => c.name) ?? [];
}
async function fetchInventory() {
  const { data } = await supabase.from('inventory').select('*').order('name');
  return (data as InvRow[] | null)?.map(toInv) ?? [];
}

export const useKarinderyaStore = create<KarinderyaState>((set, get) => ({
  categories: [],
  dishes: [],
  inventory: [],
  loaded: false,

  loadAll: async () => {
    const [dishes, categories, inventory] = await Promise.all([
      fetchDishes(),
      fetchCategories(),
      fetchInventory(),
    ]);
    set({ dishes, categories, inventory, loaded: true });
  },

  // Keep menu + inventory in sync across devices. On any change to a table,
  // refetch just that table (simple and correct for this scale).
  subscribe: () => {
    const channel = supabase
      .channel('karinderya-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, async () => {
        set({ dishes: await fetchDishes() });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, async () => {
        set({ categories: await fetchCategories() });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, async () => {
        set({ inventory: await fetchInventory() });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  addCategory: async (raw) => {
    const name = raw.trim();
    if (!name) return false;
    const { categories } = get();
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) return false;
    const { error } = await supabase.from('categories').insert({ name });
    if (error) return false;
    set({ categories: [...categories, name].sort((a, b) => a.localeCompare(b)) });
    return true;
  },

  removeCategory: async (name) => {
    const { categories } = get();
    if (!categories.includes(name) || categories.length <= 1) return;
    const fallback = categories.find((c) => c !== name) ?? 'Ulam';
    await supabase.from('dishes').update({ category: fallback }).eq('category', name);
    await supabase.from('categories').delete().eq('name', name);
    set({
      categories: categories.filter((c) => c !== name),
      dishes: get().dishes.map((d) => (d.category === name ? { ...d, category: fallback } : d)),
    });
  },

  addDish: async (partial) => {
    const id = partial.id ?? nextId('dish');
    const row = {
      id,
      name: partial.name,
      tagalog: partial.tagalog ?? '',
      price: partial.price ?? 0,
      category: partial.category,
      description: partial.description ?? '',
      image: partial.image ?? '',
      available: partial.available ?? true,
      sold_today: partial.soldToday ?? 0,
      stock_count: partial.stockCount ?? null,
    };
    const { data, error } = await supabase.from('dishes').insert(row).select('*').single();
    if (error) throw error;
    set((s) => ({ dishes: [...s.dishes, toDish(data as DishRow)] }));
    return id;
  },

  updateDish: async (id, patch) => {
    const { data, error } = await supabase
      .from('dishes')
      .update(dishPatchToRow(patch))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    set((s) => ({ dishes: s.dishes.map((d) => (d.id === id ? toDish(data as DishRow) : d)) }));
  },

  deleteDish: async (id) => {
    const { error } = await supabase.from('dishes').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ dishes: s.dishes.filter((d) => d.id !== id) }));
  },

  addInventory: async (partial) => {
    const id = partial.id ?? nextId('inv');
    const row = {
      id,
      name: partial.name,
      unit: partial.unit,
      stock: partial.stock,
      reorder_at: partial.reorderAt ?? 0,
      par_level: partial.parLevel ?? 0,
      last_delivery: partial.lastDelivery,
    };
    const { data, error } = await supabase.from('inventory').insert(row).select('*').single();
    if (error) throw error;
    set((s) => ({ inventory: [...s.inventory, toInv(data as InvRow)] }));
    return id;
  },

  updateInventory: async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.unit !== undefined) row.unit = patch.unit;
    if (patch.stock !== undefined) row.stock = patch.stock;
    if (patch.reorderAt !== undefined) row.reorder_at = patch.reorderAt;
    if (patch.parLevel !== undefined) row.par_level = patch.parLevel;
    if (patch.lastDelivery !== undefined) row.last_delivery = patch.lastDelivery;
    const { data, error } = await supabase.from('inventory').update(row).eq('id', id).select('*').single();
    if (error) throw error;
    set((s) => ({ inventory: s.inventory.map((i) => (i.id === id ? toInv(data as InvRow) : i)) }));
  },

  deleteInventory: async (id) => {
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({ inventory: s.inventory.filter((i) => i.id !== id) }));
  },
}));
