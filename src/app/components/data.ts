export type Dish = {
  id: string;
  name: string;
  tagalog: string;
  price: number;
  category: string;
  description: string;
  image: string;
  available: boolean;
  /** Owner chose to show this off on the storefront. */
  featured?: boolean;
  soldToday: number;
  /** NULL/undefined = unlimited; when set, the order trigger decrements it. */
  stockCount?: number | null;
};

export const DISHES: Dish[] = [
  {
    id: 'adobo',
    name: 'Chicken Adobo',
    tagalog: 'Adobong Manok',
    price: 85,
    category: 'Ulam',
    description: 'Soy, vinegar, garlic, bay leaf. Slow-simmered until the sauce hugs every piece.',
    image: 'https://images.unsplash.com/photo-1642509600566-96fe95a744b3?w=800&q=80',
    available: true,
    soldToday: 42,
  },
  {
    id: 'sinigang',
    name: 'Sinigang na Baboy',
    tagalog: 'Pork in Sour Broth',
    price: 95,
    category: 'Ulam',
    description: 'Tamarind-sour broth with pork belly, kangkong, sitaw, and labanos.',
    image: 'https://images.unsplash.com/photo-1585116782242-a8ee668a7b9c?w=800&q=80',
    available: true,
    soldToday: 28,
  },
  {
    id: 'tapsilog',
    name: 'Tapsilog',
    tagalog: 'Tapa • Sinangag • Itlog',
    price: 75,
    category: 'Silog',
    description: 'Marinated beef tapa, garlic fried rice, sunny-side-up egg. The classic.',
    image: 'https://images.unsplash.com/photo-1600289031464-74d374b64991?w=800&q=80',
    available: true,
    soldToday: 61,
  },
  {
    id: 'tocilog',
    name: 'Tocilog',
    tagalog: 'Tocino • Sinangag • Itlog',
    price: 70,
    category: 'Silog',
    description: 'Sweet-cured pork tocino caramelized on the pan, with garlic rice and egg.',
    image: 'https://images.unsplash.com/photo-1606525575548-2d62ed40291d?w=800&q=80',
    available: true,
    soldToday: 35,
  },
  {
    id: 'pinakbet',
    name: 'Pinakbet',
    tagalog: 'Vegetable Stew',
    price: 65,
    category: 'Ulam',
    description: 'Ilocano-style vegetables simmered with bagoong, kalabasa, ampalaya, okra.',
    image: 'https://images.unsplash.com/photo-1536489885071-87983c3e2859?w=800&q=80',
    available: true,
    soldToday: 19,
  },
  {
    id: 'lumpia',
    name: 'Lumpiang Shanghai',
    tagalog: 'Fried Pork Spring Rolls',
    price: 45,
    category: 'Merienda',
    description: 'Crispy hand-rolled pork lumpia. 5 pieces. Served with sweet-chili dip.',
    image: 'https://images.unsplash.com/photo-1759922222212-3657d43bd5b5?w=800&q=80',
    available: true,
    soldToday: 54,
  },
  {
    id: 'kaldereta',
    name: 'Kalderetang Kambing',
    tagalog: 'Goat Stew',
    price: 120,
    category: 'Ulam',
    description: 'Rich tomato-liver sauce with bell peppers, olives, and tender goat.',
    image: 'https://images.unsplash.com/photo-1771384552858-feb0574f958d?w=800&q=80',
    available: false,
    soldToday: 0,
  },
  {
    id: 'halohalo',
    name: 'Halo-Halo',
    tagalog: 'Mix-Mix',
    price: 60,
    category: 'Merienda',
    description: 'Shaved ice, leche flan, ube halaya, sago, beans, langka — a whole afternoon in a glass.',
    image: 'https://images.unsplash.com/photo-1763994682399-fc8d7612c21e?w=800&q=80',
    available: true,
    soldToday: 33,
  },
  {
    id: 'sago',
    name: 'Sago\'t Gulaman',
    tagalog: 'Tapioca Pearls & Jelly',
    price: 25,
    category: 'Inumin',
    description: 'Brown-sugar-syrup cooler with tapioca pearls and gulaman strips.',
    image: 'https://images.unsplash.com/photo-1775889184856-7b2d5caf9a47?w=800&q=80',
    available: true,
    soldToday: 88,
  },
];

export type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  reorderAt: number;
  /** How much the kitchen should have for a normal day; the shortfall is what to buy. */
  parLevel: number;
  /** Buying price for one unit. 0 means nobody has costed it yet. */
  costPerUnit: number;
  lastDelivery: string;
  lastReceivedAt?: string | null;
};

export const INVENTORY: InventoryItem[] = [
  { id: 'rice', name: 'Bigas (Rice)', unit: 'kg', stock: 48, reorderAt: 20, parLevel: 80, costPerUnit: 0, lastDelivery: 'Apr 20' },
  { id: 'chicken', name: 'Manok (Chicken)', unit: 'kg', stock: 6.2, reorderAt: 8, parLevel: 32, costPerUnit: 0, lastDelivery: 'Apr 22' },
  { id: 'pork', name: 'Baboy (Pork)', unit: 'kg', stock: 14.5, reorderAt: 10, parLevel: 40, costPerUnit: 0, lastDelivery: 'Apr 22' },
  { id: 'goat', name: 'Kambing (Goat)', unit: 'kg', stock: 0, reorderAt: 5, parLevel: 20, costPerUnit: 0, lastDelivery: 'Apr 14' },
  { id: 'soy', name: 'Toyo (Soy Sauce)', unit: 'L', stock: 3.1, reorderAt: 2, parLevel: 8, costPerUnit: 0, lastDelivery: 'Apr 18' },
  { id: 'vinegar', name: 'Suka (Vinegar)', unit: 'L', stock: 1.4, reorderAt: 2, parLevel: 8, costPerUnit: 0, lastDelivery: 'Apr 10' },
  { id: 'garlic', name: 'Bawang (Garlic)', unit: 'kg', stock: 2.8, reorderAt: 1.5, parLevel: 6, costPerUnit: 0, lastDelivery: 'Apr 21' },
  { id: 'onion', name: 'Sibuyas (Onion)', unit: 'kg', stock: 3.6, reorderAt: 2, parLevel: 8, costPerUnit: 0, lastDelivery: 'Apr 21' },
  { id: 'kangkong', name: 'Kangkong', unit: 'bundle', stock: 4, reorderAt: 6, parLevel: 24, costPerUnit: 0, lastDelivery: 'Apr 22' },
  { id: 'eggs', name: 'Itlog (Eggs)', unit: 'tray', stock: 2.5, reorderAt: 3, parLevel: 12, costPerUnit: 0, lastDelivery: 'Apr 20' },
];

export const SALES_7D = [
  { day: 'Thu', sales: 4820, expenses: 2100 },
  { day: 'Fri', sales: 6150, expenses: 2680 },
  { day: 'Sat', sales: 8720, expenses: 3120 },
  { day: 'Sun', sales: 9450, expenses: 3480 },
  { day: 'Mon', sales: 5280, expenses: 2250 },
  { day: 'Tue', sales: 5610, expenses: 2300 },
  { day: 'Wed', sales: 6890, expenses: 2640 },
];

export const HOURLY_TODAY = [
  { hr: '6A', orders: 3 },
  { hr: '7A', orders: 12 },
  { hr: '8A', orders: 21 },
  { hr: '9A', orders: 14 },
  { hr: '10A', orders: 8 },
  { hr: '11A', orders: 18 },
  { hr: '12P', orders: 34 },
  { hr: '1P', orders: 26 },
  { hr: '2P', orders: 11 },
  { hr: '3P', orders: 9 },
  { hr: '4P', orders: 14 },
  { hr: '5P', orders: 22 },
  { hr: '6P', orders: 31 },
  { hr: '7P', orders: 19 },
];

export const RECENT_ORDERS = [
  { id: '#2041', items: 'Tapsilog, Sago\'t Gulaman', total: 100, method: 'GCash', time: '6:42 PM' },
  { id: '#2040', items: 'Adobo x2, Rice x2', total: 190, method: 'Cash', time: '6:38 PM' },
  { id: '#2039', items: 'Sinigang, Halo-Halo', total: 155, method: 'GCash', time: '6:29 PM' },
  { id: '#2038', items: 'Lumpia, Tocilog', total: 115, method: 'GCash', time: '6:21 PM' },
  { id: '#2037', items: 'Pinakbet, Rice', total: 80, method: 'Cash', time: '6:14 PM' },
];
