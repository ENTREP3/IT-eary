import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Dish, InventoryItem } from '../components/data';
import { displayPath, makeDisplayCopy } from '../lib/photos';

const DISH_BUCKET = 'dish-photos';

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---- row <-> app-model mappers (DB is snake_case, app is camelCase) ---------
type DishRow = {
  featured: boolean;
  id: string; name: string; tagalog: string; price: number; category: string;
  description: string; image: string; images: string[] | null;
  available: boolean; sold_today: number;
  stock_count: number | null;
};
type InvRow = {
  id: string; name: string; unit: string; stock: number; reorder_at: number;
  par_level: number; last_delivery: string; last_received_at: string | null;
  cost_per_unit: number;
};

const toDish = (r: DishRow): Dish => ({
  id: r.id, name: r.name, tagalog: r.tagalog, price: Number(r.price),
  category: r.category, description: r.description, image: r.image,
  images: Array.isArray(r.images) && r.images.length > 0
    ? r.images
    // A dish photographed before the column existed still has its one picture.
    : (r.image ? [r.image] : []),
  available: r.available, soldToday: r.sold_today, stockCount: r.stock_count,
  featured: r.featured ?? false,
});
const toInv = (r: InvRow): InventoryItem => ({
  id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock),
  reorderAt: Number(r.reorder_at), parLevel: Number(r.par_level ?? 0),
  costPerUnit: Number(r.cost_per_unit ?? 0),
  lastDelivery: r.last_delivery, lastReceivedAt: r.last_received_at,
});

function dishPatchToRow(patch: Partial<Dish>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.tagalog !== undefined) row.tagalog = patch.tagalog;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.description !== undefined) row.description = patch.description;
  // The list is what the shop stores; a trigger keeps the single-image column
  // equal to its first entry, so writing both would be two answers to one
  // question. Only fall back to `image` for a caller that knows nothing of the
  // list — the storefront seed data, say.
  if (patch.images !== undefined) row.images = patch.images;
  else if (patch.image !== undefined) row.image = patch.image;
  if (patch.available !== undefined) row.available = patch.available;
  if (patch.soldToday !== undefined) row.sold_today = patch.soldToday;
  if (patch.stockCount !== undefined) row.stock_count = patch.stockCount;
  if (patch.featured !== undefined) row.featured = patch.featured;
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
  /**
   * Puts a photo in the bucket and hands back its URL.
   *
   * Storage rather than a data URI in the row. The menu query reads every dish
   * column, so a base64 photo is downloaded by every diner just to see the
   * list — three each across the menu came to roughly five megabytes before a
   * single price appeared. A URL is a few hundred bytes, fetched only when the
   * picture is actually shown, and cached afterwards.
   */
  uploadDishPhoto: (dishId: string, file: File) => Promise<string>;
  /** Removes a photo from the bucket. Silent for anything not stored by us. */
  removeDishPhoto: (url: string) => Promise<void>;

  addInventory: (partial: Omit<InventoryItem, 'id'> & { id?: string }) => Promise<string>;
  updateInventory: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  deleteInventory: (id: string) => Promise<void>;
};

/**
 * Frees any plate still held by a ticket nobody came for.
 *
 * Called before the menu is read, because that is the moment a stale hold does
 * its damage — a serving sitting in the platter while the page says sold out.
 * There is no pg_cron on this project, so nothing can do this on a timer.
 *
 * Failure is ignored on purpose: a menu that loads with one plate still wrongly
 * held is worth far more than no menu at all.
 */
async function sweepStaleTickets() {
  try {
    await supabase.rpc('release_stale_tickets');
  } catch {
    /* the menu matters more */
  }
}

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
    await sweepStaleTickets();
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

  uploadDishPhoto: async (dishId, file) => {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    // A fresh name every time rather than overwriting: replacing a photo should
    // not change the picture on a page somebody already has open, and it keeps
    // the cache honest without needing a cache-buster.
    const path = `${dishId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(DISH_BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (error) throw error;

    // The smaller copy the menu will actually load. Made here because this is
    // the one moment the full file is already in hand, and uploaded under a
    // fixed sibling name so nothing extra has to be stored to find it.
    //
    // A failure is deliberately swallowed: the photo itself is safely up, and a
    // card that falls back to the original is slow, not broken. Refusing the
    // whole upload over the thumbnail would be the worse trade.
    try {
      const small = await makeDisplayCopy(file);
      if (small) {
        await supabase.storage
          .from(DISH_BUCKET)
          .upload(displayPath(path), small, {
            contentType: 'image/jpeg',
            upsert: true,
          });
      }
    } catch {
      /* the original is what matters */
    }

    return supabase.storage.from(DISH_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  removeDishPhoto: async (url) => {
    // Older photos are data URIs held in the row itself; dropping one from the
    // list is all the deleting there is to do.
    const marker = `/${DISH_BUCKET}/`;
    const at = url.indexOf(marker);
    if (at < 0) return;
    const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
    // Both copies, or the bucket slowly fills with display sizes belonging to
    // photos nobody can see any more.
    await supabase.storage.from(DISH_BUCKET).remove([path, displayPath(path)]);
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
      images: partial.images ?? (partial.image ? [partial.image] : []),
      available: partial.available ?? true,
      sold_today: partial.soldToday ?? 0,
      stock_count: partial.stockCount ?? null,
      featured: partial.featured ?? false,
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
      cost_per_unit: partial.costPerUnit ?? 0,
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
    if (patch.costPerUnit !== undefined) row.cost_per_unit = patch.costPerUnit;
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
