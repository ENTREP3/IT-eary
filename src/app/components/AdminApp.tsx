import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  LayoutDashboard,
  Package,
  LineChart as LineIcon,
  UtensilsCrossed,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Bell,
  Search,
  Pencil,
  Trash2,
  Plus,
  Upload,
  Download,
  LogOut,
  Loader2,
  CheckCircle2,
  ShoppingBag,
  X,
  ChefHat,
  Clock,
  Menu,
  FlagTriangleRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { type Dish, type InventoryItem } from './data';
import { useKarinderyaStore } from '../store/karinderyaStore';
import { useAuthStore } from '../store/authStore';
import { usePaymentStore } from '../store/paymentStore';
import { useExpensesStore, expensesByDay, expensesToday } from '../store/expensesStore';
import {
  useOrdersStore,
  paymentMix,
  ordersToday,
  hourlyPulse,
  salesByDay,
  totalSales,
  bestSellers,
  formatOrderTime,
  itemsSummary,
} from '../store/ordersStore';
import { buildAnalyticsCsv, downloadTextFile } from '../lib/exportCsv';
import type { Order } from '../lib/types';
import { supabase } from '../lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

type Tab = 'dashboard' | 'kitchen' | 'inventory' | 'analytics' | 'menu' | 'payments';

/** payment_method is null until a cashier settles the ticket. */
function PaymentBadge({ method }: { method: Order['payment_method'] }) {
  const style =
    method === 'gcash'
      ? 'bg-[#0074e0]/20 text-[#6dadff]'
      : method === 'cash'
        ? 'bg-[#e8dfc8]/10'
        : 'bg-[#c8442a]/25 text-[#e87a5c]';
  const label = method === 'gcash' ? 'GCash' : method === 'cash' ? 'Cash' : 'Unpaid';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${style}`}>{label}</span>;
}

const dialogSurface = 'bg-[#0a0d0a] border-[#e8dfc8]/15 text-[#e8dfc8] sm:max-w-lg max-h-[90vh] overflow-y-auto';
const fieldCls =
  'bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/40 focus-visible:ring-[#e8a84a]/40';

export function AdminApp() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const inventory = useKarinderyaStore((s) => s.inventory);
  const dishes = useKarinderyaStore((s) => s.dishes);
  const loadAll = useKarinderyaStore((s) => s.loadAll);
  const low = useMemo(() => inventory.filter((i) => i.stock <= i.reorderAt), [inventory]);

  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const orders = useOrdersStore((s) => s.orders);
  const loadRecent = useOrdersStore((s) => s.loadRecent);
  const subscribe = useOrdersStore((s) => s.subscribe);
  const activeCount = useMemo(
    () => orders.filter((o) => ['pending', 'paid', 'preparing', 'ready'].includes(o.status)).length,
    [orders],
  );

  // Load orders once + keep them live via Realtime.
  useEffect(() => {
    loadRecent();
    const unsub = subscribe();
    return unsub;
  }, [loadRecent, subscribe]);

  // App.tsx calls loadAll() at boot, while the visitor is still anonymous — so
  // inventory (admin-only under RLS) comes back empty and never refills. This
  // component only mounts once the admin gate has passed, so re-fetch here to
  // pick up the admin-only tables.
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Global search across menu + inventory.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const dishHits = dishes
      .filter((d) => `${d.name} ${d.tagalog} ${d.category}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((d) => ({ kind: 'menu' as const, id: d.id, label: d.name, sub: `Menu · ₱${d.price}` }));
    const invHits = inventory
      .filter((i) => i.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((i) => ({ kind: 'inventory' as const, id: i.id, label: i.name, sub: `Stock · ${i.stock} ${i.unit}` }));
    return [...dishHits, ...invHits].slice(0, 8);
  }, [query, dishes, inventory]);

  // One markup definition, rendered twice: as the fixed desktop rail and as the
  // slide-in drawer on phones.
  const sidebar = (
    <>
      <div className="p-6 border-b border-[#e8dfc8]/10">
        <a
          href="/cashier"
          className="text-xs opacity-50 hover:opacity-100 flex items-center gap-1.5 mb-4"
        >
          <ArrowLeft size={13} /> Counter
        </a>
        <div
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}
          className="text-2xl leading-none"
        >
          IT<span style={{ fontStyle: 'italic', color: '#e8a84a' }}>-eary</span>
        </div>
        <div className="text-[10px] tracking-[0.25em] uppercase opacity-35 mt-1">Operations</div>
      </div>
      <nav className="p-3 flex-1 space-y-1">
        {(
          [
            ['dashboard', 'Dashboard', LayoutDashboard],
            ['kitchen', 'Kitchen', ChefHat],
            ['inventory', 'Inventory', Package],
            ['analytics', 'Sales & Profit', LineIcon],
            ['menu', 'Menu', UtensilsCrossed],
            ['payments', 'Payments', CreditCard],
          ] as const
        ).map(([k, l, Icon]) => {
          const badge = k === 'inventory' ? low.length : k === 'kitchen' ? activeCount : 0;
          return (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setNavOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                tab === k ? 'bg-[#e8a84a] text-[#0a0d0a]' : 'hover:bg-[#e8dfc8]/5'
              }`}
            >
              <Icon size={16} /> {l}
              {badge > 0 && (
                <span
                  className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
                    tab === k ? 'bg-[#0a0d0a] text-[#e8a84a]' : 'bg-[#c8442a] text-white'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-[#e8dfc8]/10">
        <div className="text-xs opacity-50">
          <div className="text-[#e8dfc8]/90">{profile?.full_name ?? 'Owner'}</div>
          <div className="mt-0.5 capitalize">{profile?.role ?? 'admin'} · signed in</div>
        </div>
        <button
          onClick={() => signOut()}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#e8dfc8]/15 text-xs hover:bg-[#c8442a]/20 hover:border-[#c8442a]/40 transition-colors"
        >
          <LogOut size={13} /> Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-[#0f1410] text-[#e8dfc8]">
      <aside className="hidden md:flex w-64 shrink-0 bg-[#0a0d0a] border-r border-[#e8dfc8]/10 flex-col">
        {sidebar}
      </aside>

      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <button
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0a0d0a] border-r border-[#e8dfc8]/10 flex flex-col overflow-y-auto">
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 bg-[#0f1410]/90 backdrop-blur border-b border-[#e8dfc8]/10 flex items-center justify-between gap-3 px-4 md:px-8 py-3 md:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="md:hidden shrink-0 p-2 -ml-2 rounded-lg hover:bg-[#e8dfc8]/10"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.3em] uppercase opacity-50">
                {tab === 'dashboard' && '— Overview'}
                {tab === 'kitchen' && '— Order queue'}
                {tab === 'inventory' && '— Stock room'}
                {tab === 'analytics' && '— Sales & Profit'}
                {tab === 'menu' && '— Menu control'}
                {tab === 'payments' && '— Payment settings'}
              </div>
              <h1
                style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
                className="text-xl md:text-3xl truncate"
              >
                {tab === 'dashboard' && `Magandang hapon, ${(profile?.full_name ?? 'Mary').split(' ')[0]}.`}
                {tab === 'kitchen' && 'Orders on the line'}
                {tab === 'inventory' && 'What we have in stock'}
                {tab === 'analytics' && 'The numbers, in plain sight'}
                {tab === 'menu' && "Today's menu"}
                {tab === 'payments' && 'How customers pay you'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* Functional search — collapses to an icon on phones. */}
            <div className="relative">
              <button
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="Search"
                className="sm:hidden p-2 rounded-lg hover:bg-[#e8dfc8]/10"
              >
                <Search size={18} />
              </button>
              <div
                className={`${
                  searchOpen
                    ? 'flex absolute right-0 top-11 w-[min(18rem,calc(100vw-2rem))] z-20'
                    : 'hidden'
                } sm:flex sm:static sm:w-auto items-center gap-2 bg-[#0a0d0a] border border-[#e8dfc8]/10 rounded-full px-3 py-2 text-sm`}
              >
                <Search size={14} className="opacity-50 hidden sm:block" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search menu & stock…"
                  className="bg-transparent outline-none w-full sm:w-44 text-sm placeholder:opacity-40"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="opacity-50 hover:opacity-100">
                    <X size={13} />
                  </button>
                )}
              </div>
              {query && (
                <div className="absolute right-0 mt-2 top-full w-[min(18rem,calc(100vw-2rem))] bg-[#0a0d0a] border border-[#e8dfc8]/15 rounded-xl overflow-hidden shadow-xl z-20">
                  {results.length === 0 ? (
                    <div className="px-4 py-3 text-sm opacity-50">No matches for “{query}”.</div>
                  ) : (
                    results.map((r) => (
                      <button
                        key={`${r.kind}-${r.id}`}
                        onClick={() => {
                          setTab(r.kind);
                          setQuery('');
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#e8dfc8]/5 flex items-center justify-between gap-3"
                      >
                        <span className="text-sm">{r.label}</span>
                        <span className="text-[10px] opacity-50">{r.sub}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <NotificationBell orders={orders} lowStock={low} onSeeOrders={() => setTab('dashboard')} />
          </div>
        </div>

        <div className="p-4 md:p-8">
          {tab === 'dashboard' && <Dashboard orders={orders} />}
          {tab === 'kitchen' && <KitchenBoard orders={orders} />}
          {tab === 'inventory' && <InventoryPanel />}
          {tab === 'analytics' && <AnalyticsPanel orders={orders} />}
          {tab === 'menu' && <MenuControl />}
          {tab === 'payments' && <PaymentsPanel />}
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Notification bell — combines new orders (live) + low-stock alerts.
// ============================================================================
const SEEN_KEY = 'it-eary-notif-seen';

function NotificationBell({
  orders,
  lowStock,
  onSeeOrders,
}: {
  orders: Order[];
  lowStock: InventoryItem[];
  onSeeOrders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SEEN_KEY) : null;
    return v ? Number(v) : 0;
  });
  const ref = useRef<HTMLDivElement>(null);

  const newOrders = useMemo(
    () => orders.filter((o) => new Date(o.created_at).getTime() > lastSeen),
    [orders, lastSeen],
  );
  const unread = newOrders.length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markSeen = () => {
    const now = Date.now();
    setLastSeen(now);
    localStorage.setItem(SEEN_KEY, String(now));
  };

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) markSeen();
      return next;
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative w-9 h-9 grid place-items-center rounded-full border border-[#e8dfc8]/15 hover:bg-[#e8dfc8]/5"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {(unread > 0 || lowStock.length > 0) && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-[#c8442a] text-white text-[10px]">
            {unread + lowStock.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 mt-2 w-80 bg-[#0a0d0a] border border-[#e8dfc8]/15 rounded-2xl overflow-hidden shadow-2xl z-30"
          >
            <div className="px-4 py-3 border-b border-[#e8dfc8]/10 text-[10px] tracking-[0.25em] uppercase opacity-50">
              Notifications
            </div>

            <div className="max-h-96 overflow-auto">
              {lowStock.length > 0 && (
                <div className="px-4 py-2 space-y-2">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#e87a5c] flex items-center gap-1.5">
                    <AlertTriangle size={11} /> Low stock
                  </div>
                  {lowStock.map((i) => (
                    <div key={i.id} className="text-sm flex items-center justify-between">
                      <span>{i.name}</span>
                      <span className="opacity-50 text-xs">
                        {i.stock} {i.unit} left
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-2">
                <div className="text-[10px] tracking-[0.2em] uppercase opacity-50 flex items-center gap-1.5 mb-2">
                  <ShoppingBag size={11} /> Recent orders
                </div>
                {orders.length === 0 ? (
                  <div className="text-sm opacity-40 py-2">No orders yet.</div>
                ) : (
                  orders.slice(0, 6).map((o) => (
                    <div
                      key={o.id}
                      className="text-sm flex items-center justify-between py-1.5 border-b border-[#e8dfc8]/5 last:border-0"
                    >
                      <div className="min-w-0">
                        <span className="font-mono tracking-[0.1em] opacity-70">{o.ticket_code}</span>{' '}
                        <PaymentBadge method={o.payment_method} />
                      </div>
                      <div className="text-right shrink-0">
                        <div style={{ fontFamily: 'var(--font-display)' }}>₱{o.total}</div>
                        <div className="text-[10px] opacity-40">{formatOrderTime(o.created_at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => {
                setOpen(false);
                onSeeOrders();
              }}
              className="w-full px-4 py-2.5 text-sm text-[#e8a84a] hover:bg-[#e8dfc8]/5 border-t border-[#e8dfc8]/10"
            >
              View dashboard
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0a0d0a] border border-[#e8dfc8]/10 rounded-2xl ${className}`}>{children}</div>
);

function Stat({
  label,
  value,
  delta,
  good,
}: {
  label: string;
  value: string;
  delta?: string;
  good?: boolean;
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">{label}</div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
          className="text-2xl md:text-4xl"
        >
          {value}
        </div>
        {delta && (
          <span className={`flex items-center gap-1 text-xs ${good ? 'text-[#8cc07a]' : 'text-[#e87a5c]'}`}>
            {good ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Sales the cashier released without verifiable proof. These are real money
 * questions, so they sit at the top of the dashboard until the owner has
 * checked them against the actual GCash transaction history.
 */
function ReconciliationPanel({ orders }: { orders: Order[] }) {
  const flagged = useMemo(
    () => orders.filter((o) => o.payment_status === 'needs_review'),
    [orders],
  );
  const resolveReview = useOrdersStore((s) => s.resolveReview);
  const signedProofUrl = useOrdersStore((s) => s.signedProofUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  if (flagged.length === 0) return null;

  const resolve = async (code: string, verified: boolean) => {
    setBusy(code);
    setError(null);
    try {
      await resolveReview(
        code,
        verified,
        verified ? 'Confirmed against GCash history' : 'Not found in GCash history',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve.');
    } finally {
      setBusy(null);
    }
  };

  const openProof = async (path: string) => {
    const url = await signedProofUrl(path);
    setViewing(url);
  };

  return (
    <Card className="p-4 md:p-5 border-[#e8a84a]/40 bg-[#e8a84a]/10">
      <div className="flex items-center gap-2 text-[#e8a84a] text-sm">
        <FlagTriangleRight size={15} />
        <span className="tracking-[0.15em] uppercase text-xs">
          Needs reconciliation · {flagged.length}
        </span>
      </div>
      <p className="mt-2 text-xs opacity-60">
        Released to the diner without verified proof. Check your GCash history,
        then confirm or cancel each one.
      </p>

      {error && <p className="mt-2 text-xs text-[#e87a5c]">{error}</p>}

      <div className="mt-4 space-y-2">
        {flagged.map((o) => (
          <div
            key={o.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-[#0a0d0a] border border-[#e8dfc8]/10"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  style={{ fontFamily: 'var(--font-display)' }}
                  className="text-[#e8a84a] tracking-widest"
                >
                  {o.ticket_code}
                </span>
                <span className="text-sm opacity-70">₱{Number(o.total).toFixed(2)}</span>
              </div>
              <div className="text-[11px] opacity-50 truncate">
                {o.customer_name ?? 'Walk-in'} · {formatOrderTime(o.created_at)}
                {o.review_note ? ` · ${o.review_note}` : ''}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {o.proof_path && (
                <button
                  onClick={() => openProof(o.proof_path!)}
                  className="px-3 py-1.5 rounded-lg border border-[#e8dfc8]/20 text-xs hover:bg-[#e8dfc8]/10"
                >
                  View proof
                </button>
              )}
              <button
                onClick={() => resolve(o.ticket_code, true)}
                disabled={busy === o.ticket_code}
                className="px-3 py-1.5 rounded-lg bg-[#8cc07a] text-[#0a0d0a] text-xs font-medium disabled:opacity-40"
              >
                {busy === o.ticket_code ? '…' : 'Payment found'}
              </button>
              <button
                onClick={() => resolve(o.ticket_code, false)}
                disabled={busy === o.ticket_code}
                className="px-3 py-1.5 rounded-lg border border-[#c8442a]/50 text-[#e87a5c] text-xs disabled:opacity-40"
              >
                Never paid
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setViewing(null)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <img
            src={viewing}
            alt="GCash receipt"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </Card>
  );
}

function Dashboard({ orders }: { orders: Order[] }) {
  const inventory = useKarinderyaStore((s) => s.inventory);
  const low = inventory.filter((i) => i.stock <= i.reorderAt);

  const today = ordersToday(orders);
  const sales7d = totalSales(orders);
  const pulse = useMemo(() => hourlyPulse(orders), [orders]);
  const recent = orders.slice(0, 5);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Stat label="Sales · 7d" value={`₱${sales7d.toLocaleString()}`} />
        <Stat label="Orders · 7d" value={orders.length.toString()} />
        <Stat label="Orders today" value={today.length.toString()} />
        <Stat
          label="Today's sales"
          value={`₱${totalSales(today).toLocaleString()}`}
        />
      </motion.div>

      <ReconciliationPanel orders={orders} />

      {low.length > 0 && (
        <Card className="p-5 border-[#c8442a]/40 bg-[#c8442a]/10">
          <div className="flex items-center gap-2 text-[#e87a5c] text-sm">
            <AlertTriangle size={15} /> <span className="tracking-[0.15em] uppercase text-xs">Low Stock Alert</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {low.map((i) => (
              <span
                key={i.id}
                className="text-sm px-3 py-1.5 rounded-full bg-[#0a0d0a] border border-[#c8442a]/30"
              >
                {i.name} — <b>
                  {i.stock} {i.unit}
                </b> left
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Orders by hour · today</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1">
                Today's pulse
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pulse}>
              <CartesianGrid stroke="#e8dfc820" vertical={false} />
              <XAxis dataKey="hr" stroke="#e8dfc880" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#e8dfc880" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0a0d0a', border: '1px solid #e8dfc830', borderRadius: 12 }}
              />
              <Bar dataKey="orders" fill="#e8a84a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 md:p-6">
          <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Latest Orders</div>
          <div className="mt-4 space-y-3">
            {recent.length === 0 && <div className="text-sm opacity-40">No orders yet today.</div>}
            {recent.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 text-sm pb-3 border-b border-[#e8dfc8]/10 last:border-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tracking-[0.1em] opacity-70">{o.ticket_code}</span>
                    <PaymentBadge method={o.payment_method} />
                  </div>
                  <div className="truncate opacity-70 text-xs mt-0.5">{itemsSummary(o.items)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>₱{o.total}</div>
                  <div className="text-[10px] opacity-50">{formatOrderTime(o.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Kitchen / order-queue board — live FIFO lanes with status advancement.
// ============================================================================
function KitchenBoard({ orders }: { orders: Order[] }) {
  const setStatus = useOrdersStore((s) => s.setStatus);

  const lanes = [
    { title: 'New', statuses: ['pending', 'paid'], accent: '#6dadff', next: 'preparing' as const, nextLabel: 'Start preparing' },
    { title: 'Preparing', statuses: ['preparing'], accent: '#e8a84a', next: 'ready' as const, nextLabel: 'Mark ready' },
    { title: 'Ready', statuses: ['ready'], accent: '#8cc07a', next: 'completed' as const, nextLabel: 'Complete' },
  ];

  const fifo = (statuses: string[]) =>
    orders
      .filter((o) => statuses.includes(o.status))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {lanes.map((lane) => {
        const list = fifo(lane.statuses);
        return (
          <div key={lane.title} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: lane.accent }} />
              <span className="text-sm tracking-[0.15em] uppercase opacity-70">{lane.title}</span>
              <span className="text-xs opacity-40">({list.length})</span>
            </div>

            {list.length === 0 && (
              <Card className="p-5 text-sm opacity-40 border-dashed">Nothing here.</Card>
            )}

            {list.map((o) => (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono tracking-[0.15em] text-[#e8a84a]">
                      {o.ticket_code}
                    </span>
                    <PaymentBadge method={o.payment_method} />
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {(o.items ?? []).map((it, idx) => (
                      <div key={idx} className="text-sm flex justify-between gap-2">
                        <span className="opacity-85">{it.qty} × {it.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] opacity-40 flex items-center gap-1">
                      <Clock size={11} /> {formatOrderTime(o.created_at)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>₱{o.total}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setStatus(o.id, lane.next)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-[#0a0d0a]"
                      style={{ background: lane.accent }}
                    >
                      {lane.nextLabel}
                    </button>
                    {lane.title === 'New' && (
                      <button
                        onClick={() => setStatus(o.id, 'cancelled')}
                        className="px-3 py-2 rounded-lg border border-[#e8dfc8]/15 text-[#e87a5c] hover:bg-[#c8442a]/20"
                        aria-label="Cancel order"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function InventoryPanel() {
  const inventory = useKarinderyaStore((s) => s.inventory);
  const updateInventory = useKarinderyaStore((s) => s.updateInventory);
  const addInventory = useKarinderyaStore((s) => s.addInventory);
  const deleteInventory = useKarinderyaStore((s) => s.deleteInventory);

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [stock, setStock] = useState(0);
  const [reorderAt, setReorderAt] = useState(0);
  const [lastDelivery, setLastDelivery] = useState('');

  const openNew = () => {
    setEditing(null);
    setName('');
    setUnit('kg');
    setStock(0);
    setReorderAt(0);
    setLastDelivery('');
    setOpen(true);
  };

  const openEdit = (i: InventoryItem) => {
    setEditing(i);
    setName(i.name);
    setUnit(i.unit);
    setStock(i.stock);
    setReorderAt(i.reorderAt);
    setLastDelivery(i.lastDelivery);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    if (editing) {
      await updateInventory(editing.id, { name, unit, stock, reorderAt, lastDelivery: lastDelivery.trim() || '—' });
    } else {
      await addInventory({ name, unit, stock, reorderAt, lastDelivery: lastDelivery.trim() || '—' });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium"
        >
          <Plus size={16} /> Add ingredient
        </button>
      </div>

      <Card className="overflow-hidden">
        {/* Column headings only make sense once the row is actually a table. */}
        <div className="hidden md:grid grid-cols-12 px-6 py-3 border-b border-[#e8dfc8]/10 text-[10px] tracking-[0.25em] uppercase opacity-50">
          <div className="col-span-3">Ingredient</div>
          <div className="col-span-2">Stock</div>
          <div className="col-span-3">Level</div>
          <div className="col-span-2">Last delivery</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {inventory.map((i, idx) => {
          const ratio = Math.min(1, i.stock / (i.reorderAt * 2.5));
          const low = i.stock <= i.reorderAt;
          const out = i.stock === 0;
          const actions = (
            <>
              <button
                type="button"
                onClick={() => openEdit(i)}
                className="p-2 rounded-lg hover:bg-[#e8dfc8]/10 text-[#e8dfc8]/80"
                aria-label="Edit"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(i.id)}
                className="p-2 rounded-lg hover:bg-[#c8442a]/20 text-[#e87a5c]"
                aria-label="Delete"
              >
                <Trash2 size={15} />
              </button>
            </>
          );
          return (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-0 px-4 md:px-6 py-4 border-b border-[#e8dfc8]/5 md:items-center hover:bg-[#e8dfc8]/[0.02]"
            >
              <div className="md:col-span-3 flex items-center justify-between gap-2">
                <span>{i.name}</span>
                <div className="flex gap-1 md:hidden">{actions}</div>
              </div>
              <div className="md:col-span-2" style={{ fontFamily: 'var(--font-display)' }}>
                {i.stock} <span className="opacity-50 text-sm">{i.unit}</span>
              </div>
              <div className="md:col-span-3">
                <div className="h-1.5 rounded-full bg-[#e8dfc8]/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${ratio * 100}%`,
                      background: out ? '#c8442a' : low ? '#e8a84a' : '#8cc07a',
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] opacity-50">
                  Reorder at {i.reorderAt} {i.unit}
                </div>
              </div>
              <div className="md:col-span-2 text-sm opacity-60">
                <span className="md:hidden opacity-70">Last delivery · </span>
                {i.lastDelivery}
              </div>
              <div className="md:col-span-2 hidden md:flex justify-end gap-1">
                {actions}
              </div>
            </motion.div>
          );
        })}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={dialogSurface}>
          <DialogHeader>
            <DialogTitle className="text-[#e8dfc8]">
              {editing ? 'Edit ingredient' : 'Add ingredient'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-[#e8dfc8]/70">Name</Label>
              <Input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[#e8dfc8]/70">Unit</Label>
                <Input className={fieldCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div>
                <Label className="text-[#e8dfc8]/70">Last delivery</Label>
                <Input
                  className={fieldCls}
                  value={lastDelivery}
                  onChange={(e) => setLastDelivery(e.target.value)}
                  placeholder="Apr 22"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[#e8dfc8]/70">Stock</Label>
                <Input
                  type="number"
                  className={fieldCls}
                  value={stock}
                  onChange={(e) => setStock(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label className="text-[#e8dfc8]/70">Reorder at</Label>
                <Input
                  type="number"
                  className={fieldCls}
                  value={reorderAt}
                  onChange={(e) => setReorderAt(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#e8dfc8]/20"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="px-4 py-2 rounded-lg bg-[#e8a84a] text-[#0a0d0a]"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="bg-[#0a0d0a] border-[#e8dfc8]/15 text-[#e8dfc8]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove ingredient?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#e8dfc8]/60">
              This will remove the row from inventory. You can add it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#e8dfc8]/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#c8442a] text-white"
              onClick={() => {
                if (deleteId) deleteInventory(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full" style={{ background: color }} />{' '}
    <span className="opacity-70">{label}</span>
  </span>
);

function AnalyticsPanel({ orders }: { orders: Order[] }) {
  const dishes = useKarinderyaStore((s) => s.dishes);
  const inventory = useKarinderyaStore((s) => s.inventory);
  const expenses = useExpensesStore((s) => s.expenses);
  const loadExpenses = useExpensesStore((s) => s.load);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Both lines are now live: sales from orders, expenses from the expenses table.
  const live = useMemo(() => salesByDay(orders), [orders]);
  const exp = useMemo(() => expensesByDay(expenses), [expenses]);
  const chartData = live.map((d, idx) => {
    const dayExpenses = exp[idx]?.expenses ?? 0;
    return { day: d.day, sales: d.sales, expenses: dayExpenses, profit: d.sales - dayExpenses };
  });

  const mix = useMemo(() => paymentMix(orders), [orders]);
  const top = useMemo(() => bestSellers(orders, 5), [orders]);
  const fallbackTop = useMemo(
    () => [...dishes].filter((d) => d.available).sort((a, b) => b.soldToday - a.soldToday).slice(0, 5).map((d) => ({ name: d.name, qty: d.soldToday })),
    [dishes],
  );
  const sellers = top.length > 0 ? top : fallbackTop;
  const maxQty = Math.max(1, ...sellers.map((s) => s.qty));

  const today = ordersToday(orders);
  const COLORS = ['#e8a84a', '#c8442a', '#3a5a3a', '#8cc07a', '#6dadff'];

  const handleExport = useCallback(() => {
    const csv = buildAnalyticsCsv([
      {
        title: 'Sales (last 7 days, live)',
        headers: ['day', 'sales_php'],
        rows: live.map((d) => [d.day, d.sales]),
      },
      {
        title: 'Orders (last 7 days, live)',
        headers: ['ticket', 'items', 'total_php', 'method', 'status', 'created_at', 'paid_at'],
        rows: orders.map((o) => [o.ticket_code, itemsSummary(o.items), o.total, o.payment_method ?? 'unpaid', o.status, o.created_at, o.paid_at ?? '']),
      },
      {
        title: 'Payment mix (live)',
        headers: ['method', 'orders', 'percent'],
        rows: [
          ['GCash', mix.gcash, mix.gcashPct],
          ['Cash', mix.cash, mix.cashPct],
        ],
      },
      {
        title: 'Expenses (last 30 days, live)',
        headers: ['spent_on', 'label', 'category', 'amount_php'],
        rows: expenses.map((e) => [e.spent_on, e.label, e.category, e.amount]),
      },
      {
        title: 'Menu items (current)',
        headers: ['id', 'name', 'tagalog', 'category', 'price_php', 'available'],
        rows: dishes.map((d) => [d.id, d.name, d.tagalog, d.category, d.price, d.available]),
      },
      {
        title: 'Inventory (current)',
        headers: ['id', 'name', 'unit', 'stock', 'reorder_at', 'last_delivery'],
        rows: inventory.map((i) => [i.id, i.name, i.unit, i.stock, i.reorderAt, i.lastDelivery]),
      },
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`it-eary-analytics-${stamp}.csv`, csv);
  }, [orders, live, mix, dishes, inventory, expenses]);

  const todayGross = totalSales(today);
  const todayExpenses = expensesToday(expenses);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 flex-1 w-full">
          <Stat label="Today's gross" value={`₱${todayGross.toLocaleString()}`} />
          <Stat
            label="Today's net"
            value={`₱${(todayGross - todayExpenses).toLocaleString()}`}
            delta={`₱${todayExpenses.toLocaleString()} exp`}
            good={todayGross - todayExpenses >= 0}
          />
          <Stat label="GCash share" value={`${mix.gcashPct}%`} />
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="shrink-0 w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#e8dfc8]/20 bg-[#0a0d0a] text-sm hover:bg-[#e8dfc8]/10"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <Card className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Last 7 days</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1">
              Sales vs expenses
            </div>
          </div>
          <div className="flex gap-4 text-xs">
            <Legend color="#e8a84a" label="Sales" />
            <Legend color="#c8442a" label="Expenses" />
            <Legend color="#8cc07a" label="Net profit" />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#e8dfc820" vertical={false} />
            <XAxis dataKey="day" stroke="#e8dfc880" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#e8dfc880" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#0a0d0a', border: '1px solid #e8dfc830', borderRadius: 12 }}
            />
            <Line type="monotone" dataKey="sales" stroke="#e8a84a" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="expenses" stroke="#c8442a" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="profit" stroke="#8cc07a" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 md:p-6">
          <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Best sellers · 7d</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1 mb-5">
            What's flying off the pan
          </div>
          <div className="space-y-4">
            {sellers.map((d, i) => (
              <div key={d.name}>
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span>{d.name}</span>
                  <span style={{ fontFamily: 'var(--font-display)' }}>
                    {d.qty} <span className="opacity-50">sold</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#e8dfc8]/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.qty / maxQty) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1 }}
                    className="h-full rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                </div>
              </div>
            ))}
            {sellers.length === 0 && <p className="text-sm opacity-50">No sales yet.</p>}
          </div>
        </Card>

        <Card className="p-4 md:p-6">
          <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Payment mix · live</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1 mb-2">
            How diners pay
          </div>
          {mix.total === 0 ? (
            <div className="h-[220px] grid place-items-center text-sm opacity-50">No orders yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'GCash', v: mix.gcash },
                    { name: 'Cash', v: mix.cash },
                  ]}
                  dataKey="v"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  <Cell fill="#0074e0" />
                  <Cell fill="#e8a84a" />
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0a0d0a', border: '1px solid #e8dfc830', borderRadius: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-6 text-sm">
            <Legend color="#0074e0" label={`GCash · ${mix.gcashPct}%`} />
            <Legend color="#e8a84a" label={`Cash · ${mix.cashPct}%`} />
          </div>
        </Card>
      </div>

      <ExpensesManager />
    </div>
  );
}

// ============================================================================
// Expenses manager — captures real costs so the profit line is real.
// ============================================================================
const EXPENSE_CATEGORIES = ['Supplies', 'Utilities', 'Labor', 'Rent', 'Other'];

function ExpensesManager() {
  const expenses = useExpensesStore((s) => s.expenses);
  const add = useExpensesStore((s) => s.add);
  const remove = useExpensesStore((s) => s.remove);

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = parseFloat(amount);
    if (!label.trim() || !(value > 0)) {
      setError('Enter a label and an amount greater than 0.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await add({ label: label.trim(), amount: value, category, spentOn });
      setLabel('');
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense.');
    } finally {
      setBusy(false);
    }
  };

  const recent = expenses.slice(0, 8);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Costs</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1">
            Expenses
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-end mb-5">
        <div>
          <Label className="text-[#e8dfc8]/70">What was it for?</Label>
          <Input className={fieldCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Palengke supplies" />
        </div>
        <div>
          <Label className="text-[#e8dfc8]/70">Amount (₱)</Label>
          <Input
            type="number"
            className={fieldCls + ' w-full md:w-28'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label className="text-[#e8dfc8]/70">Category</Label>
          <select
            className={`h-9 rounded-md border px-3 ${fieldCls}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[#e8dfc8]/70">Date</Label>
          <Input type="date" className={fieldCls} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add
        </button>
      </div>
      {error && <p className="text-sm text-[#e87a5c] mb-3">{error}</p>}

      <div className="space-y-2">
        {recent.length === 0 && <p className="text-sm opacity-50">No expenses logged yet.</p>}
        {recent.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between gap-3 text-sm py-2 border-b border-[#e8dfc8]/5 last:border-0"
          >
            <div className="min-w-0">
              <span>{e.label}</span>
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8dfc8]/10">{e.category}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] opacity-40">{e.spent_on}</span>
              <span style={{ fontFamily: 'var(--font-display)' }}>₱{Number(e.amount).toLocaleString()}</span>
              <button
                onClick={() => remove(e.id)}
                className="p-1.5 rounded-md hover:bg-[#c8442a]/20 text-[#e87a5c]"
                aria-label="Delete expense"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// Payments panel — admin updates GCash details + uploads the QR code.
// ============================================================================
/**
 * Receipt screenshots are kept indefinitely, and the Supabase free tier allows
 * 1 GB. Surfacing the number means hitting the ceiling is a decision rather
 * than a surprise on a busy day.
 */
function StorageUsage() {
  const [rows, setRows] = useState<{ bucket: string; object_count: number; bytes: number }[]>([]);

  useEffect(() => {
    supabase.rpc('storage_usage').then(({ data }) => setRows(data ?? []));
  }, []);

  const total = rows.reduce((a, r) => a + Number(r.bytes), 0);
  const proofs = rows.find((r) => r.bucket === 'payment-proofs');
  const FREE_TIER = 1024 ** 3;
  const pct = Math.min(100, (total / FREE_TIER) * 100);

  return (
    <Card className="p-4 md:p-6">
      <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">Storage</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1">
        Receipt images
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm opacity-60">
          {proofs?.object_count ?? 0} receipt{proofs?.object_count === 1 ? '' : 's'} stored
        </span>
        <span style={{ fontFamily: 'var(--font-display)' }} className="text-xl">
          {(total / 1024 / 1024).toFixed(1)} MB
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[#e8dfc8]/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(pct, 0.5)}%`,
            background: pct > 80 ? '#c8442a' : pct > 50 ? '#e8a84a' : '#8cc07a',
          }}
        />
      </div>
      <div className="mt-2 text-[11px] opacity-45">
        {pct < 1 ? 'Well under' : `${pct.toFixed(1)}% of`} the 1 GB free allowance.
        Images are shrunk on the phone before upload, so roughly 10,000 receipts fit.
      </div>
    </Card>
  );
}

function PaymentsPanel() {
  const settings = usePaymentStore((s) => s.settings);
  const load = usePaymentStore((s) => s.load);
  const update = usePaymentStore((s) => s.update);
  const uploadQr = usePaymentStore((s) => s.uploadQr);

  const [gcashName, setGcashName] = useState('');
  const [gcashNumber, setGcashNumber] = useState('');
  const [gcashEnabled, setGcashEnabled] = useState(true);
  const [cashEnabled, setCashEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) load();
  }, [settings, load]);

  useEffect(() => {
    if (settings) {
      setGcashName(settings.gcash_name);
      setGcashNumber(settings.gcash_number);
      setGcashEnabled(settings.gcash_enabled);
      setCashEnabled(settings.cash_enabled);
    }
  }, [settings]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await update({
        gcash_name: gcashName,
        gcash_number: gcashNumber,
        gcash_enabled: gcashEnabled,
        cash_enabled: cashEnabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadQr(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-4 md:p-6 space-y-4">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">GCash account</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1">
              Where money lands
            </div>
          </div>

          <div>
            <Label className="text-[#e8dfc8]/70">Account name</Label>
            <Input className={fieldCls} value={gcashName} onChange={(e) => setGcashName(e.target.value)} />
          </div>
          <div>
            <Label className="text-[#e8dfc8]/70">GCash number</Label>
            <Input
              className={fieldCls}
              value={gcashNumber}
              onChange={(e) => setGcashNumber(e.target.value)}
              placeholder="0917 555 0123"
            />
          </div>

          <div className="space-y-2 pt-1">
            <Toggle label="Accept GCash" checked={gcashEnabled} onChange={setGcashEnabled} />
            <Toggle label="Accept Cash" checked={cashEnabled} onChange={setCashEnabled} />
          </div>

          {error && <p className="text-sm text-[#e87a5c]">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#e8a84a] text-[#0a0d0a] font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : null}
            {saved ? 'Saved' : 'Save changes'}
          </button>
          {settings && (
            <p className="text-[10px] opacity-40 text-center">
              Last updated {new Date(settings.updated_at).toLocaleString()}
            </p>
          )}
        </Card>

        <Card className="p-4 md:p-6 space-y-4">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase opacity-50">GCash QR code</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl mt-1">
              Scan-to-pay image
            </div>
          </div>

          <div className="aspect-square rounded-2xl border border-[#e8dfc8]/15 bg-[#0f1410] grid place-items-center overflow-hidden">
            {settings?.gcash_qr_url ? (
              <img src={settings.gcash_qr_url} alt="GCash QR" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center opacity-40 text-sm px-6">
                No QR uploaded yet. Customers will see the number above.
              </div>
            )}
          </div>

          <label className="cursor-pointer w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#e8dfc8]/20 text-sm hover:bg-[#e8dfc8]/5">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? 'Uploading…' : settings?.gcash_qr_url ? 'Replace QR image' : 'Upload QR image'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} />
          </label>
          <p className="text-[10px] opacity-40 text-center">PNG, JPG or WebP · up to 5 MB</p>
        </Card>
      </div>

      <StorageUsage />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm opacity-80">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-[#8cc07a]' : 'bg-[#e8dfc8]/15'}`}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[26px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

const emptyDish: Omit<Dish, 'id'> = {
  name: '',
  tagalog: '',
  price: 0,
  category: 'Ulam',
  description: '',
  image: '',
  available: true,
  soldToday: 0,
  stockCount: null,
};

function MenuControl() {
  const categories = useKarinderyaStore((s) => s.categories);
  const dishes = useKarinderyaStore((s) => s.dishes);
  const addCategory = useKarinderyaStore((s) => s.addCategory);
  const removeCategory = useKarinderyaStore((s) => s.removeCategory);
  const addDish = useKarinderyaStore((s) => s.addDish);
  const updateDish = useKarinderyaStore((s) => s.updateDish);
  const deleteDish = useKarinderyaStore((s) => s.deleteDish);

  const [newCat, setNewCat] = useState('');
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Dish, 'id'>>(emptyDish);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [imageFileName, setImageFileName] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyDish, category: categories[0] ?? 'Ulam' });
    setNewCategoryName('');
    setImageFileName('');
    setOpen(true);
  };

  const openEdit = (d: Dish) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      tagalog: d.tagalog,
      price: d.price,
      category: d.category,
      description: d.description,
      image: d.image,
      available: d.available,
      soldToday: d.soldToday,
      stockCount: d.stockCount ?? null,
    });
    setNewCategoryName('');
    setImageFileName('');
    setOpen(true);
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    setImageFileName(f.name);
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === 'string') setForm((p) => ({ ...p, image: r.result as string }));
    };
    r.readAsDataURL(f);
  };

  const saveDish = async () => {
    if (!form.name.trim()) return;
    const cat = newCategoryName.trim() || form.category;
    if (newCategoryName.trim()) await addCategory(newCategoryName.trim());
    if (editingId) {
      await updateDish(editingId, { ...form, category: cat });
    } else {
      await addDish({ ...form, category: cat });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-[10px] tracking-[0.25em] uppercase opacity-50 mb-2">Add category</div>
          <div className="flex gap-2">
            <Input
              className={fieldCls + ' max-w-xs'}
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="e.g. Pancit"
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && (await addCategory(newCat))) setNewCat('');
              }}
            />
            <button
              type="button"
              onClick={async () => {
                if (await addCategory(newCat)) setNewCat('');
              }}
              className="px-3 py-2 rounded-lg border border-[#e8dfc8]/20 text-sm"
            >
              Add
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-[#0a0d0a] border border-[#e8dfc8]/15 text-xs"
            >
              {c}
              {categories.length > 1 && (
                <button
                  type="button"
                  className="p-0.5 rounded-full hover:bg-[#e8dfc8]/10"
                  onClick={() => removeCategory(c)}
                  aria-label={`Remove ${c}`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="sm:ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium"
        >
          <Plus size={16} /> Add food
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dishes.map((d) => (
          <Card key={d.id} className="p-5 flex flex-col gap-3">
            <div className="flex items-start gap-4">
              <img src={d.image} alt={d.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="truncate">
                  {d.name}
                </div>
                <div className="text-xs opacity-50 mt-0.5">
                  ₱{d.price} · {d.category} · {d.soldToday} sold
                </div>
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(d)}
                    className="p-1.5 rounded-md hover:bg-[#e8dfc8]/10"
                    aria-label="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToDelete(d.id)}
                    className="p-1.5 rounded-md hover:bg-[#c8442a]/20 text-[#e87a5c]"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateDish(d.id, { available: !d.available })}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                  d.available ? 'bg-[#8cc07a]' : 'bg-[#e8dfc8]/15'
                }`}
                aria-label="Toggle available"
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                    d.available ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={dialogSurface}>
          <DialogHeader>
            <DialogTitle className="text-[#e8dfc8]">
              {editingId ? 'Edit food' : 'Add food'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-[#e8dfc8]/70">Name</Label>
              <Input
                className={fieldCls}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-[#e8dfc8]/70">Tagalog / subtitle</Label>
              <Input
                className={fieldCls}
                value={form.tagalog}
                onChange={(e) => setForm((p) => ({ ...p, tagalog: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[#e8dfc8]/70">Price (₱)</Label>
                <Input
                  type="number"
                  className={fieldCls}
                  value={form.price}
                  onChange={(e) => setForm((p) => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-[#e8dfc8]/70">Sold today</Label>
                <Input
                  type="number"
                  className={fieldCls}
                  value={form.soldToday}
                  onChange={(e) => setForm((p) => ({ ...p, soldToday: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-[#e8dfc8]/70">Stock left (blank = unlimited)</Label>
              <Input
                type="number"
                className={fieldCls}
                value={form.stockCount ?? ''}
                placeholder="Unlimited"
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    stockCount: e.target.value === '' ? null : parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
              <p className="text-[10px] opacity-40 mt-1">
                When set, each order subtracts from this and auto-marks the dish sold out at 0.
              </p>
            </div>
            <div>
              <Label className="text-[#e8dfc8]/70">Category</Label>
              <select
                className={`w-full h-9 rounded-md border px-3 ${fieldCls}`}
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[#e8dfc8]/70">Or new category</Label>
              <Input
                className={fieldCls}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Leave empty to use the selection above"
              />
            </div>
            <div>
              <Label className="text-[#e8dfc8]/70">Description</Label>
              <Textarea
                className={fieldCls + ' min-h-20'}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-[#e8dfc8]/70 flex items-center gap-2">
                <Upload size={14} /> Meal photo
              </Label>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                <label className="cursor-pointer px-3 py-2 rounded-lg border border-[#e8dfc8]/20 text-sm hover:bg-[#e8dfc8]/5">
                  Choose image
                  <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                </label>
                {imageFileName && <span className="text-xs opacity-50 truncate max-w-[200px]">{imageFileName}</span>}
                {form.image && (
                  <img src={form.image} alt="" className="h-12 w-12 rounded-lg object-cover border border-[#e8dfc8]/15" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="avail"
                checked={form.available}
                onChange={(e) => setForm((p) => ({ ...p, available: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="avail" className="text-[#e8dfc8]/90 cursor-pointer">
                Available for ordering
              </Label>
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-[#e8dfc8]/20"
            >
              Cancel
            </button>
            <button type="button" onClick={saveDish} className="px-4 py-2 rounded-lg bg-[#e8a84a] text-[#0a0d0a]">
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="bg-[#0a0d0a] border-[#e8dfc8]/15 text-[#e8dfc8]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dish?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#e8dfc8]/60">
              Customers will no longer see it on the menu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[#e8dfc8]/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#c8442a] text-white"
              onClick={() => {
                if (toDelete) deleteDish(toDelete);
                setToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
