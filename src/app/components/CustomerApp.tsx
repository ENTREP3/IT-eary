import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Minus,
  ShoppingBag,
  X,
  Check,
  Smartphone,
  Banknote,
  User as UserIcon,
  LogOut,
  Loader2,
} from 'lucide-react';
import { Dish } from './data';
import { ImageWithFallback } from './sigma/ImageWithFallback';
import { useKarinderyaStore } from '../store/karinderyaStore';
import { useAuthStore } from '../store/authStore';
import { usePaymentStore } from '../store/paymentStore';
import { useOrdersStore } from '../store/ordersStore';
import { AuthScreen } from './auth/AuthScreen';
import type { OrderItem, PaymentMethod } from '../lib/types';

type CartLine = { dish: Dish; qty: number };

export function CustomerApp() {
  const categories = useKarinderyaStore((s) => s.categories);
  const dishList = useKarinderyaStore((s) => s.dishes);
  const menuLoaded = useKarinderyaStore((s) => s.loaded);
  const [cat, setCat] = useState<string>('Ulam');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    if (categories.length && !categories.includes(cat)) {
      setCat(categories[0]);
    }
  }, [categories, cat]);

  const visible = dishList.filter((d) => d.category === cat);
  const count = cart.reduce((a, c) => a + c.qty, 0);
  const total = cart.reduce((a, c) => a + c.qty * c.dish.price, 0);

  const add = (d: Dish) => {
    setCart((prev) => {
      const ex = prev.find((l) => l.dish.id === d.id);
      if (ex) return prev.map((l) => (l.dish.id === d.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { dish: d, qty: 1 }];
    });
  };
  const sub = (id: string) =>
    setCart((prev) => prev.flatMap((l) => (l.dish.id === id ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l])));

  const getDishById = (id: string) => dishList.find((x) => x.id === id);

  const firstName = (profile?.full_name || user?.email || '').split(' ')[0].split('@')[0];

  return (
    <div className="min-h-screen bg-[#f4ead5] text-[#2a1810]">
      <header className="sticky top-0 z-20 bg-[#f4ead5]/90 backdrop-blur border-b border-[#2a1810]/10">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-4 flex items-center justify-between">
          {/* account control (left) */}
          <div className="w-32 flex items-center">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-sm opacity-70">Hi, {firstName}</span>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-[#2a1810]/20 hover:bg-[#2a1810] hover:text-[#f4ead5] transition-colors"
                  title="Log out"
                >
                  <LogOut size={13} /> <span className="hidden sm:inline">Log out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-[#2a1810]/20 hover:bg-[#2a1810] hover:text-[#f4ead5] transition-colors"
              >
                <UserIcon size={14} /> Log in
              </button>
            )}
          </div>

          <div className="text-center">
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }} className="text-2xl leading-none">IT<span style={{ fontStyle: 'italic', color: '#c8442a' }}>-eary</span></div>
            <div className="text-[10px] tracking-[0.3em] uppercase opacity-60 mt-0.5">Today's Menu</div>
          </div>
          <button
            onClick={() => count && setCheckout(true)}
            className="relative w-32 flex items-center justify-end gap-2"
            disabled={!count}
          >
            <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#2a1810] text-[#f4ead5] disabled:opacity-40">
              <ShoppingBag size={16} />
              <span className="text-sm">₱{total}</span>
            </span>
            {count > 0 && (
              <span className="absolute -top-1 right-0 w-5 h-5 rounded-full bg-[#e8a84a] text-[#2a1810] text-[11px] grid place-items-center">{count}</span>
            )}
          </button>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 md:px-10 pt-10 pb-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs tracking-[0.25em] uppercase opacity-60 mb-3">— Fri, April 24</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 0.9 }} className="text-5xl md:text-7xl">
              Kain na, <em style={{ color: '#c8442a' }}>tayo na.</em>
            </h1>
            <p className="mt-4 opacity-70 max-w-lg">Only what's cooking right now. If it isn't here, it's sold out — balik ka bukas.</p>
          </div>
          <div className="text-sm opacity-60">
            {menuLoaded
              ? `${dishList.filter((d) => d.available).length} dishes available · ${dishList.filter((d) => !d.available).length} sold out`
              : 'Loading the menu…'}
          </div>
        </div>

        <nav className="mt-8 flex gap-2 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-sm transition-all ${
                cat === c ? 'bg-[#2a1810] text-[#f4ead5]' : 'bg-[#fbf4e3] border border-[#2a1810]/15 hover:border-[#2a1810]/40'
              }`}
            >
              {c}
            </button>
          ))}
        </nav>
      </section>

      <section className="max-w-6xl mx-auto px-5 md:px-10 pb-24">
        <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {visible.map((d, i) => (
              <motion.article
                key={d.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="group relative rounded-3xl bg-[#fbf4e3] border border-[#2a1810]/10 overflow-hidden"
              >
                <div className="aspect-[4/3] overflow-hidden relative">
                  <ImageWithFallback
                    src={d.image} alt={d.name}
                    className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-105 ${!d.available ? 'grayscale opacity-50' : ''}`}
                  />
                  {!d.available && (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="px-3 py-1 bg-[#2a1810] text-[#f4ead5] text-xs tracking-[0.25em] uppercase -rotate-3">Sold Out</span>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#fbf4e3]/90 text-[11px] tracking-[0.2em] uppercase">{d.category}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.01em' }} className="text-2xl leading-tight">{d.name}</h3>
                      <div className="text-xs opacity-55 italic mt-0.5">{d.tagalog}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-xl whitespace-nowrap">₱{d.price}</div>
                  </div>
                  <p className="mt-3 text-sm opacity-70 leading-relaxed">{d.description}</p>
                  <button
                    onClick={() => add(d)}
                    disabled={!d.available}
                    className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-[#2a1810]/25 hover:bg-[#2a1810] hover:text-[#f4ead5] transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#2a1810]"
                  >
                    <Plus size={15} /> <span className="text-sm">Add to order</span>
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      <AnimatePresence>
        {checkout && (
          <Checkout
            cart={cart}
            total={total}
            onClose={() => setCheckout(false)}
            onInc={(id) => {
              const d = getDishById(id);
              if (d) add(d);
            }}
            onDec={sub}
            onDone={() => { setCart([]); setCheckout(false); }}
            onRequireAuth={() => setAuthOpen(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {authOpen && (
          <AuthScreen
            mode="customer"
            onClose={() => setAuthOpen(false)}
            onSuccess={() => setAuthOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Checkout({
  cart, total, onClose, onInc, onDec, onDone, onRequireAuth,
}: {
  cart: CartLine[]; total: number; onClose: () => void; onInc: (id: string) => void; onDec: (id: string) => void; onDone: () => void; onRequireAuth: () => void;
}) {
  const [stage, setStage] = useState<'cart' | 'method' | 'gcash' | 'confirming' | 'done'>('cart');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const settings = usePaymentStore((s) => s.settings);
  const placeOrder = useOrdersStore((s) => s.placeOrder);

  const finalize = async (chosen: PaymentMethod) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setError(null);
    setStage('confirming');
    try {
      const items: OrderItem[] = cart.map((l) => ({
        id: l.dish.id,
        name: l.dish.name,
        qty: l.qty,
        price: l.dish.price,
      }));
      const order = await placeOrder({
        items,
        total,
        paymentMethod: chosen,
        customerName: profile?.full_name ?? user.email ?? null,
      });
      setReference(order.reference);
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order.');
      setStage('method');
    }
  };

  const chooseMethod = (m: PaymentMethod) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setMethod(m);
    if (m === 'gcash') setStage('gcash');
    else finalize('cash');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#2a1810]/60 backdrop-blur-sm grid place-items-end md:place-items-center"
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full md:max-w-lg bg-[#f4ead5] md:rounded-3xl rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-[#2a1810]/10">
          <div className="text-xs tracking-[0.3em] uppercase opacity-60">
            {stage === 'cart' && 'Your Order'}
            {stage === 'method' && 'How will you pay?'}
            {stage === 'gcash' && 'GCash Payment'}
            {stage === 'confirming' && 'Placing order…'}
            {stage === 'done' && 'Success'}
          </div>
          <button onClick={onClose} className="p-1 hover:opacity-70"><X size={18} /></button>
        </div>

        {stage === 'cart' && (
          <>
            <div className="flex-1 overflow-auto p-5 space-y-3">
              {cart.map(l => (
                <div key={l.dish.id} className="flex items-center gap-4 p-3 rounded-2xl bg-[#fbf4e3] border border-[#2a1810]/10">
                  <ImageWithFallback src={l.dish.image} alt={l.dish.name} className="w-14 h-14 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="truncate">{l.dish.name}</div>
                    <div className="text-xs opacity-60">₱{l.dish.price} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => onDec(l.dish.id)} className="w-7 h-7 rounded-full border border-[#2a1810]/25 grid place-items-center"><Minus size={13} /></button>
                    <span className="w-5 text-center">{l.qty}</span>
                    <button onClick={() => onInc(l.dish.id)} className="w-7 h-7 rounded-full border border-[#2a1810]/25 grid place-items-center"><Plus size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-[#2a1810]/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="opacity-60 text-sm">Total</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-3xl">₱{total}</span>
              </div>
              <button onClick={() => setStage('method')} className="w-full py-3.5 rounded-full bg-[#2a1810] text-[#f4ead5] flex items-center justify-center gap-2">
                Proceed to payment
              </button>
            </div>
          </>
        )}

        {stage === 'method' && (
          <div className="p-6 space-y-4">
            {!user && (
              <div className="rounded-2xl bg-[#c8442a]/10 border border-[#c8442a]/30 p-4 text-sm">
                <p className="opacity-80">Please log in to place your order.</p>
                <button onClick={onRequireAuth} className="mt-3 px-4 py-2 rounded-full bg-[#2a1810] text-[#f4ead5] text-sm">
                  Log in / Register
                </button>
              </div>
            )}
            <p className="text-sm opacity-70">Choose your payment method for <b>₱{total}</b>:</p>
            <div className="grid gap-3">
              {(settings?.gcash_enabled ?? true) && (
                <button
                  onClick={() => chooseMethod('gcash')}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-[#2a1810]/15 bg-[#fbf4e3] hover:border-[#0074e0] transition-colors text-left"
                >
                  <span className="w-11 h-11 rounded-full bg-[#0074e0] text-white grid place-items-center"><Smartphone size={20} /></span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-lg">GCash</div>
                    <div className="text-xs opacity-60">Pay online via the QR or number</div>
                  </div>
                </button>
              )}
              {(settings?.cash_enabled ?? true) && (
                <button
                  onClick={() => chooseMethod('cash')}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-[#2a1810]/15 bg-[#fbf4e3] hover:border-[#3a5a3a] transition-colors text-left"
                >
                  <span className="w-11 h-11 rounded-full bg-[#3a5a3a] text-white grid place-items-center"><Banknote size={20} /></span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-lg">Cash</div>
                    <div className="text-xs opacity-60">Pay at the counter when you pick up</div>
                  </div>
                </button>
              )}
            </div>
            {error && <p className="text-sm text-[#c8442a]">{error}</p>}
          </div>
        )}

        {stage === 'gcash' && (
          <div className="p-6 space-y-5 overflow-auto">
            <div className="rounded-2xl bg-gradient-to-br from-[#0074e0] to-[#00a4e4] text-white p-5">
              <div className="text-xs opacity-80 tracking-[0.25em] uppercase">GCash · Send Money</div>
              <div className="mt-5 text-sm opacity-90">{settings?.gcash_name ?? 'K-MARY Karinderya'}</div>
              <div style={{ fontFamily: 'var(--font-display)' }} className="text-2xl tracking-wider">{settings?.gcash_number ?? '0917 555 0123'}</div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] opacity-70">Amount</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-4xl">₱{total}</div>
                </div>
              </div>
            </div>

            {settings?.gcash_qr_url && (
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs opacity-60 uppercase tracking-[0.2em]">Scan to pay</div>
                <img
                  src={settings.gcash_qr_url}
                  alt="GCash QR"
                  className="w-44 h-44 rounded-2xl object-cover border border-[#2a1810]/15 bg-white"
                />
              </div>
            )}

            <ol className="text-sm space-y-2 opacity-80">
              <li>1. Open GCash → Send Money</li>
              <li>2. Scan the QR or enter <b>{settings?.gcash_number ?? '0917 555 0123'}</b></li>
              <li>3. Send <b>₱{total}</b>, then tap confirm below</li>
            </ol>
            {error && <p className="text-sm text-[#c8442a]">{error}</p>}
            <button
              onClick={() => finalize('gcash')}
              className="w-full py-3.5 rounded-full bg-[#2a1810] text-[#f4ead5]"
            >I've sent the payment</button>
          </div>
        )}

        {stage === 'confirming' && (
          <div className="p-12 grid place-items-center gap-4">
            <Loader2 className="w-10 h-10 text-[#c8442a] animate-spin" />
            <div className="text-sm opacity-70">Recording your order…</div>
          </div>
        )}

        {stage === 'done' && (
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#3a5a3a] text-white grid place-items-center mx-auto"><Check size={28} /></div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-3xl">Salamat po!</h3>
            <p className="opacity-70 text-sm">
              Order {reference} received · paid via <b>{method === 'gcash' ? 'GCash' : 'Cash'}</b>.<br />
              Ihanda na namin — estimated ready in 10–15 min.
            </p>
            <button onClick={onDone} className="mt-2 w-full py-3 rounded-full bg-[#2a1810] text-[#f4ead5]">Back to menu</button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
