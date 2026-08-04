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
  Loader2,
  Copy,
  Upload,
  RefreshCw,
  Ticket as TicketIcon,
  ImageIcon,
  ArrowLeft,
} from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { usePaymentStore } from '../../store/paymentStore';
import { supabase } from '../../lib/supabase';
import { Receipt } from '../Receipt';
import { ImageWithFallback } from '../sigma/ImageWithFallback';
import type { Dish } from '../data';
import type { Order, PaymentMethod } from '../../lib/types';

type Stage = 'menu' | 'cart' | 'ticket';
type CartLine = { dish: Dish; qty: number };

/**
 * The diner-facing web storefront — the browser twin of the Flutter app.
 *
 * Deliberately mirrors the mobile flow rather than inventing a second one:
 * browse → cart → choose a method → ticket code → (GCash) upload the receipt.
 * No account anywhere; the ticket code carries identity.
 */
export function StorefrontApp() {
  const categories = useKarinderyaStore((s) => s.categories);
  const dishes = useKarinderyaStore((s) => s.dishes);
  const menuLoaded = useKarinderyaStore((s) => s.loaded);

  const [stage, setStage] = useState<Stage>('menu');
  const [cat, setCat] = useState<string>('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  // Open on a category that actually has food today. Landing on one where
  // everything is sold out reads as though the karinderya is closed.
  useEffect(() => {
    if (!categories.length || categories.includes(cat)) return;
    const stocked = categories.find((c) =>
      dishes.some((d) => d.category === c && d.available),
    );
    setCat(stocked ?? categories[0]);
  }, [categories, dishes, cat]);

  const visible = dishes.filter((d) => d.category === cat);
  const count = cart.reduce((a, c) => a + c.qty, 0);
  const total = cart.reduce((a, c) => a + c.qty * c.dish.price, 0);

  const add = (d: Dish) =>
    setCart((prev) => {
      const ex = prev.find((l) => l.dish.id === d.id);
      return ex
        ? prev.map((l) => (l.dish.id === d.id ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { dish: d, qty: 1 }];
    });

  const sub = (id: string) =>
    setCart((prev) =>
      prev.flatMap((l) =>
        l.dish.id === id ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l],
      ),
    );

  const onPlaced = (o: Order) => {
    setOrder(o);
    setCart([]);
    setStage('ticket');
  };

  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink">
      <header className="sticky top-0 z-20 bg-diner-ground/90 backdrop-blur border-b border-diner-ink/10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => setStage('menu')}
            className="text-left"
            aria-label="IT-eary home"
          >
            <div
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}
              className="text-2xl leading-none"
            >
              IT<span style={{ fontStyle: 'italic' }} className="text-diner-accent">-eary</span>
            </div>
            <div className="text-[10px] tracking-[0.3em] uppercase opacity-55 mt-0.5">
              Today's menu
            </div>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLookupOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-diner-ink/20 hover:bg-diner-ink hover:text-diner-ground transition-colors"
            >
              <TicketIcon size={14} />
              <span className="hidden sm:inline">Find my ticket</span>
            </button>
            <button
              onClick={() => count && setStage('cart')}
              disabled={!count}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-diner-ink text-diner-ground disabled:opacity-40"
            >
              <ShoppingBag size={16} />
              <span className="text-sm tabular-nums">₱{total.toFixed(2)}</span>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-diner-accent text-white text-[11px] grid place-items-center">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {stage === 'menu' && (
        <>
          <section className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-4">
            <h1
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 0.95 }}
              className="text-4xl md:text-6xl"
            >
              Kain na, <em className="text-diner-accent">tayo na.</em>
            </h1>
            <p className="mt-3 opacity-70 max-w-lg text-sm md:text-base">
              Only what's cooking right now. If it isn't here, it's sold out — balik ka bukas.
            </p>

            <nav className="mt-6 flex gap-2 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`px-4 py-2 rounded-full text-sm transition-all ${
                    cat === c
                      ? 'bg-diner-ink text-diner-ground'
                      : 'bg-diner-card border border-diner-ink/15 hover:border-diner-ink/40'
                  }`}
                >
                  {c}
                </button>
              ))}
            </nav>
          </section>

          <section className="max-w-5xl mx-auto px-4 md:px-8 pb-24">
            {!menuLoaded ? (
              <div className="py-20 grid place-items-center opacity-50">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visible.map((d) => (
                  <DishCard
                    key={d.id}
                    dish={d}
                    qty={cart.find((l) => l.dish.id === d.id)?.qty ?? 0}
                    onAdd={() => add(d)}
                    onSub={() => sub(d.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <AnimatePresence>
        {stage === 'cart' && (
          <CartSheet
            cart={cart}
            total={total}
            onClose={() => setStage('menu')}
            onAdd={add}
            onSub={sub}
            onPlaced={onPlaced}
          />
        )}
      </AnimatePresence>

      {stage === 'ticket' && order && (
        <TicketView order={order} onDone={() => setStage('menu')} onUpdate={setOrder} />
      )}

      <AnimatePresence>
        {lookupOpen && (
          <LookupSheet
            onClose={() => setLookupOpen(false)}
            onFound={(o) => {
              setLookupOpen(false);
              onPlaced(o);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DishCard({
  dish,
  qty,
  onAdd,
  onSub,
}: {
  dish: Dish;
  qty: number;
  onAdd: () => void;
  onSub: () => void;
}) {
  return (
    <article
      className={`rounded-3xl bg-diner-card border border-diner-ink/10 overflow-hidden ${
        dish.available ? '' : 'opacity-50'
      }`}
    >
      <div className="aspect-[4/3] overflow-hidden relative">
        <ImageWithFallback
          src={dish.image}
          alt={dish.name}
          className={`w-full h-full object-cover ${dish.available ? '' : 'grayscale'}`}
        />
        {!dish.available && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="px-3 py-1 bg-diner-ink text-diner-ground text-xs tracking-[0.25em] uppercase -rotate-3">
              Sold out
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
              className="text-xl leading-tight"
            >
              {dish.name}
            </h3>
            {dish.tagalog && <div className="text-xs opacity-55 italic">{dish.tagalog}</div>}
          </div>
          <div
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
            className="text-lg whitespace-nowrap"
          >
            ₱{dish.price}
          </div>
        </div>
        {dish.description && (
          <p className="mt-2 text-sm opacity-70 leading-relaxed">{dish.description}</p>
        )}

        {!dish.available ? null : qty === 0 ? (
          <button
            onClick={onAdd}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-diner-ink/25 hover:bg-diner-ink hover:text-diner-ground transition-colors"
          >
            <Plus size={15} /> <span className="text-sm">Add to order</span>
          </button>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              onClick={onSub}
              className="w-9 h-9 rounded-full border border-diner-ink/25 grid place-items-center hover:bg-diner-ink/5"
              aria-label={`Remove one ${dish.name}`}
            >
              <Minus size={15} />
            </button>
            <span className="w-6 text-center text-lg tabular-nums">{qty}</span>
            <button
              onClick={onAdd}
              className="w-9 h-9 rounded-full border border-diner-ink/25 grid place-items-center hover:bg-diner-ink/5"
              aria-label={`Add one ${dish.name}`}
            >
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function CartSheet({
  cart,
  total,
  onClose,
  onAdd,
  onSub,
  onPlaced,
}: {
  cart: CartLine[];
  total: number;
  onClose: () => void;
  onAdd: (d: Dish) => void;
  onSub: (id: string) => void;
  onPlaced: (o: Order) => void;
}) {
  const settings = usePaymentStore((s) => s.settings);
  const [name, setName] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't preselect a method the owner has switched off.
  useEffect(() => {
    if (!settings) return;
    if (!settings.cash_enabled && settings.gcash_enabled) setMethod('gcash');
    if (!settings.gcash_enabled && settings.cash_enabled) setMethod('cash');
  }, [settings]);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      // Only ids and quantities — the server prices the order.
      const { data, error: rpcErr } = await supabase.rpc('create_ticket', {
        p_items: cart.map((l) => ({ id: l.dish.id, qty: l.qty })),
        p_customer_name: name.trim() || null,
        p_payment_method: method,
      });
      if (rpcErr) throw rpcErr;
      onPlaced(data as Order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the order.');
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-diner-ink/60 backdrop-blur-sm grid place-items-end md:place-items-center"
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full md:max-w-lg bg-diner-ground md:rounded-3xl rounded-t-3xl overflow-hidden max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-diner-ink/10">
          <div className="text-xs tracking-[0.3em] uppercase opacity-60">Your order</div>
          <button onClick={onClose} className="p-1 hover:opacity-70" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-3">
          {cart.map((l) => (
            <div
              key={l.dish.id}
              className="flex items-center gap-3 p-3 rounded-2xl bg-diner-card border border-diner-ink/10"
            >
              <div className="flex-1 min-w-0">
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="truncate">
                  {l.dish.name}
                </div>
                <div className="text-xs opacity-60">₱{l.dish.price.toFixed(2)} each</div>
              </div>
              <button
                onClick={() => onSub(l.dish.id)}
                className="w-8 h-8 rounded-full border border-diner-ink/25 grid place-items-center"
                aria-label="Remove one"
              >
                <Minus size={13} />
              </button>
              <span className="w-5 text-center tabular-nums">{l.qty}</span>
              <button
                onClick={() => onAdd(l.dish)}
                className="w-8 h-8 rounded-full border border-diner-ink/25 grid place-items-center"
                aria-label="Add one"
              >
                <Plus size={13} />
              </button>
            </div>
          ))}

          <label className="block pt-2">
            <span className="text-xs opacity-60">Your name (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Helps staff call your order"
              className="mt-1 w-full h-11 rounded-xl border border-diner-ink/15 bg-diner-card px-4 text-sm outline-none focus:border-diner-ink/40"
            />
          </label>

          <div className="pt-2">
            <div className="text-[11px] tracking-[0.2em] uppercase opacity-55 mb-2">
              How will you pay?
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(settings?.cash_enabled ?? true) && (
                <MethodButton
                  selected={method === 'cash'}
                  onClick={() => setMethod('cash')}
                  icon={<Banknote size={20} />}
                  label="Cash"
                  blurb="Pay at the counter"
                  tone="cash"
                />
              )}
              {(settings?.gcash_enabled ?? true) && (
                <MethodButton
                  selected={method === 'gcash'}
                  onClick={() => setMethod('gcash')}
                  icon={<Smartphone size={20} />}
                  label="GCash"
                  blurb="Send, then upload the receipt"
                  tone="gcash"
                />
              )}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-diner-ink/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="opacity-60 text-sm">Total</span>
            <span
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
              className="text-3xl tabular-nums"
            >
              ₱{total.toFixed(2)}
            </span>
          </div>
          <p className="text-xs opacity-55 leading-relaxed">
            {method === 'gcash'
              ? "You'll get the GCash details and a ticket next. Send the payment, upload the receipt, then show the ticket at the counter."
              : 'You pay at the counter. The cashier confirms the final amount.'}
          </p>
          {error && <p className="text-sm text-diner-accent">{error}</p>}
          <button
            onClick={checkout}
            disabled={busy || cart.length === 0}
            className="w-full py-3.5 rounded-full bg-diner-ink text-diner-ground flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Get my ticket
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MethodButton({
  selected,
  onClick,
  icon,
  label,
  blurb,
  tone,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  blurb: string;
  tone: 'cash' | 'gcash';
}) {
  const ring = tone === 'gcash' ? 'border-semantic-gcash' : 'border-semantic-cash';
  const text = tone === 'gcash' ? 'text-semantic-gcash' : 'text-semantic-cash';
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-2xl border text-center transition-all ${
        selected
          ? `${ring} border-2 bg-diner-card`
          : 'border-diner-ink/15 bg-diner-card hover:border-diner-ink/30'
      }`}
    >
      <span className={`grid place-items-center ${selected ? text : 'opacity-70'}`}>{icon}</span>
      <span className={`block mt-1.5 text-sm font-medium ${selected ? text : ''}`}>{label}</span>
      <span className="block text-[11px] opacity-60 leading-tight mt-0.5">{blurb}</span>
    </button>
  );
}

/** Ticket code, live status, GCash payment details + proof upload, receipt. */
function TicketView({
  order,
  onDone,
  onUpdate,
}: {
  order: Order;
  onDone: () => void;
  onUpdate: (o: Order) => void;
}) {
  const settings = usePaymentStore((s) => s.settings);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const paid = !!order.paid_at;
  const isGcash = order.payment_method === 'gcash';

  // Live: flips to Paid while the diner is standing at the counter.
  useEffect(() => {
    const channel = supabase
      .channel(`diner-ticket-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (p) => onUpdate(p.new as Order),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [order.id, onUpdate]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      if (order.proof_path) {
        await supabase.rpc('clear_payment_proof', { p_ticket_code: order.ticket_code });
      }
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${order.ticket_code}/${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data, error: rpcErr } = await supabase.rpc('attach_payment_proof', {
        p_ticket_code: order.ticket_code,
        p_path: path,
      });
      if (rpcErr) throw rpcErr;
      onUpdate(data as Order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 md:px-8 py-6 space-y-4">
      <button
        onClick={onDone}
        className="text-xs opacity-60 hover:opacity-100 flex items-center gap-1.5"
      >
        <ArrowLeft size={13} /> Back to the menu
      </button>

      <div className="rounded-3xl bg-diner-ink text-diner-ground p-7 text-center">
        <div className="text-[11px] tracking-[0.3em] uppercase opacity-60">
          Show this at the counter
        </div>
        <div
          className="mt-3 text-5xl font-mono font-extrabold tracking-[0.2em]"
          style={{ color: 'var(--color-staff-accent)' }}
        >
          {order.ticket_code}
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(order.ticket_code)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100"
        >
          <Copy size={13} /> Copy code
        </button>
      </div>

      <div
        className={`rounded-2xl p-4 border flex items-start gap-3 ${
          paid
            ? 'bg-semantic-good/15 border-semantic-good/40'
            : 'bg-staff-accent/15 border-staff-accent/40'
        }`}
      >
        {paid ? (
          <Check size={18} className="mt-0.5 text-semantic-cash shrink-0" />
        ) : (
          <Loader2 size={18} className="mt-0.5 shrink-0 opacity-60" />
        )}
        <div>
          <div className="font-medium text-sm">
            {paid
              ? 'Paid — waiting for the kitchen'
              : isGcash && !order.proof_path
                ? 'Send your GCash payment, then upload the receipt'
                : 'Show this to the cashier'}
          </div>
          {paid && (
            <div className="text-xs opacity-65 mt-0.5">
              {order.payment_status === 'needs_review'
                ? 'The counter is confirming your payment — your order is being prepared.'
                : `Paid via ${order.payment_method === 'gcash' ? 'GCash' : 'Cash'}`}
            </div>
          )}
        </div>
      </div>

      {isGcash && !paid && (
        <div className="rounded-2xl bg-diner-card border border-semantic-gcash/35 p-4">
          <div className="flex items-center gap-2 text-semantic-gcash text-[11px] tracking-[0.2em] uppercase font-semibold">
            <Smartphone size={15} /> Pay via GCash
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Send to" value={settings?.gcash_name || '—'} />
            <Row label="Number" value={settings?.gcash_number || '—'} mono />
            <Row label="Amount" value={`₱${Number(order.total).toFixed(2)}`} mono />
          </dl>
          {settings?.gcash_qr_url && (
            <img
              src={settings.gcash_qr_url}
              alt="GCash QR code"
              className="mt-3 mx-auto w-40 h-40 object-contain rounded-xl bg-white"
            />
          )}

          <div className="mt-4 pt-4 border-t border-diner-ink/10">
            {order.proof_path ? (
              <p className="text-xs opacity-75 flex items-start gap-2">
                <Check size={14} className="mt-0.5 text-semantic-cash shrink-0" />
                Receipt uploaded — show this ticket at the counter.
              </p>
            ) : (
              <p className="text-xs opacity-70 leading-relaxed">
                Send the payment, then upload the GCash receipt so the cashier can confirm it.
              </p>
            )}
            {error && <p className="mt-2 text-xs text-diner-accent">{error}</p>}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-3 w-full py-3 rounded-full bg-semantic-gcash text-white flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : order.proof_path ? (
                <RefreshCw size={16} />
              ) : (
                <Upload size={16} />
              )}
              {uploading
                ? 'Uploading…'
                : order.proof_path
                  ? 'Replace receipt'
                  : 'Upload GCash receipt'}
            </button>
          </div>
        </div>
      )}

      <Receipt order={order} />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs opacity-55">{label}</dt>
      <dd className={`font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

/** Pull a ticket back up on another device, or after closing the tab. */
function LookupSheet({
  onClose,
  onFound,
}: {
  onClose: () => void;
  onFound: (o: Order) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('ticket_code', trimmed)
      .maybeSingle();
    setBusy(false);
    if (!data) setError(`No ticket "${trimmed}".`);
    else onFound(data as Order);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-diner-ink/60 backdrop-blur-sm grid place-items-center p-4"
    >
      <form
        onSubmit={find}
        className="w-full max-w-sm bg-diner-ground rounded-3xl p-6 border border-diner-ink/10"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-2xl">
            Find my ticket
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          placeholder="K7M2Q9"
          className="w-full h-14 rounded-2xl bg-diner-card border border-diner-ink/15 text-center text-2xl font-mono tracking-[0.3em] outline-none focus:border-diner-ink/40"
        />
        {error && <p className="mt-2 text-sm text-diner-accent text-center">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full py-3 rounded-full bg-diner-ink text-diner-ground flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Find ticket
        </button>
      </form>
    </motion.div>
  );
}
