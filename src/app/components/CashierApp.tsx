import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Loader2,
  Banknote,
  Smartphone,
  LogOut,
  ArrowLeft,
  AlertCircle,
  Clock,
  ImageOff,
  Maximize2,
  ShieldCheck,
  FlagTriangleRight,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOrdersStore } from '../store/ordersStore';
import { Receipt } from './Receipt';
import { KitchenBoard } from './shared/KitchenBoard';
import type { Order, PaymentMethod, PaymentStatus } from '../lib/types';
import { supabase } from '../lib/supabase';

type Stage = 'lookup' | 'review' | 'receipt';

export function CashierApp() {
  // In a karinderya this size the person on the till is also the person calling
  // to the kitchen, so the counter screen carries the order queue too.
  const [view, setView] = useState<'counter' | 'kitchen'>('counter');
  const [stage, setStage] = useState<Stage>('lookup');
  const [code, setCode] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const findByTicket = useOrdersStore((s) => s.findByTicket);
  const markPaid = useOrdersStore((s) => s.markPaid);
  const signedProofUrl = useOrdersStore((s) => s.signedProofUrl);

  useEffect(() => {
    if (stage === 'lookup') inputRef.current?.focus();
  }, [stage]);

  // Fetch a fresh signed URL whenever the shown ticket's proof changes.
  const loadProof = useCallback(
    async (o: Order | null) => {
      if (!o?.proof_path) {
        setProofUrl(null);
        return;
      }
      setProofLoading(true);
      setProofUrl(await signedProofUrl(o.proof_path));
      setProofLoading(false);
    },
    [signedProofUrl],
  );

  useEffect(() => {
    loadProof(order);
  }, [order?.proof_path, loadProof]);

  /**
   * A GCash diner often uploads while already standing at the counter, so the
   * review screen listens for the proof landing instead of making the cashier
   * re-type the code.
   */
  useEffect(() => {
    if (stage !== 'review' || !order) return;
    const channel = supabase
      .channel(`ticket-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => setOrder(payload.new as Order),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [stage, order?.id]);

  const reset = () => {
    setStage('lookup');
    setCode('');
    setOrder(null);
    setError(null);
    setProofUrl(null);
    setZoomed(false);
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const found = await findByTicket(trimmed);
      if (!found) {
        setError(`No ticket "${trimmed.toUpperCase()}". Check the code and try again.`);
      } else {
        setOrder(found);
        setStage(found.paid_at ? 'receipt' : 'review');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const settle = async (
    method: PaymentMethod,
    status: PaymentStatus = 'verified',
    opts: { inPerson?: boolean; note?: string } = {},
  ) => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const paid = await markPaid({
        ticketCode: order.ticket_code,
        method,
        status,
        inPerson: opts.inPerson ?? false,
        note: opts.note ?? null,
      });
      setOrder(paid);
      setStage('receipt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1410] text-[#e8dfc8] flex flex-col">
      <header className="border-b border-[#e8dfc8]/10 px-6 py-4 flex items-center justify-between print:hidden">
        <div>
          <div
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}
            className="text-2xl leading-none"
          >
            Ben<span style={{ fontStyle: 'italic', color: '#e8a84a' }}>cris</span>
          </div>
          <div className="text-[10px] tracking-[0.25em] uppercase opacity-40 mt-1">Counter</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg border border-[#e8dfc8]/15 overflow-hidden text-xs">
            {(
              [
                ['counter', 'Counter'],
                ['kitchen', 'Kitchen'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`px-3 py-2 transition-colors ${
                  view === k ? 'bg-[#e8a84a] text-[#0a0d0a]' : 'hover:bg-[#e8dfc8]/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-right text-xs opacity-60 hidden sm:block">
            <div className="text-[#e8dfc8]/90">{profile?.full_name ?? 'Cashier'}</div>
            <div className="capitalize">{profile?.role} · signed in</div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e8dfc8]/15 text-xs hover:bg-[#c8442a]/20 hover:border-[#c8442a]/40 transition-colors"
          >
            <LogOut size={13} /> Log out
          </button>
        </div>
      </header>

      {view === 'kitchen' ? (
        <main className="flex-1 p-6 overflow-auto">
          <h2 className="text-[11px] tracking-[0.25em] uppercase opacity-45 mb-4">Order queue</h2>
          <KitchenOrders />
        </main>
      ) : (
      <main className="flex-1 grid place-items-center p-6">
        <AnimatePresence mode="wait">
          {stage === 'lookup' && (
            <motion.form
              key="lookup"
              onSubmit={lookup}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="w-full max-w-md text-center"
            >
              <h1
                style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
                className="text-4xl"
              >
                Enter ticket code
              </h1>
              <p className="mt-2 text-sm opacity-50">
                Type the code on the diner's screen, then press Enter.
              </p>

              <input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K7M2Q9"
                maxLength={12}
                autoComplete="off"
                spellCheck={false}
                className="mt-7 w-full text-center bg-[#0a0d0a] border-2 border-[#e8dfc8]/15 focus:border-[#e8a84a] rounded-2xl px-6 py-6 text-4xl tracking-[0.35em] font-mono outline-none transition-colors placeholder:opacity-20"
              />

              {error && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#e87a5c]">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="mt-6 w-full py-4 rounded-2xl bg-[#e8a84a] text-[#0a0d0a] font-medium flex items-center justify-center gap-2 disabled:opacity-30 transition-opacity"
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                Look up ticket
              </button>
            </motion.form>
          )}

          {stage === 'review' && order && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="w-full max-w-md"
            >
              <button
                onClick={reset}
                className="text-xs opacity-50 hover:opacity-100 flex items-center gap-1.5 mb-4"
              >
                <ArrowLeft size={13} /> Another ticket
              </button>

              <div className="bg-[#0a0d0a] border border-[#e8dfc8]/10 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.25em] opacity-40">Ticket</div>
                    <div
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                      className="text-3xl tracking-[0.15em] text-[#e8a84a]"
                    >
                      {order.ticket_code}
                    </div>
                    {order.customer_name && (
                      <div className="text-sm opacity-60 mt-1">{order.customer_name}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* The method is the first thing the cashier needs to know. */}
                    <span
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        order.payment_method === 'gcash'
                          ? 'bg-semantic-gcash/20 text-semantic-gcash-soft'
                          : 'bg-semantic-cash/25 text-semantic-good'
                      }`}
                    >
                      {order.payment_method === 'gcash' ? (
                        <Smartphone size={12} />
                      ) : (
                        <Banknote size={12} />
                      )}
                      {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
                    </span>
                    <span className="text-[11px] opacity-40 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(order.created_at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-2 border-t border-[#e8dfc8]/10 pt-4">
                  {(order.items ?? []).map((item, i) => (
                    <div key={i} className="flex justify-between gap-3 text-sm">
                      <span className="opacity-85">
                        {item.qty} × {item.name}
                      </span>
                      <span className="opacity-60 whitespace-nowrap">
                        ₱{(item.qty * item.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-[#e8dfc8]/10 pt-4 flex justify-between items-baseline">
                  <span className="text-xs uppercase tracking-[0.25em] opacity-50">Total due</span>
                  <span
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    className="text-4xl"
                  >
                    ₱{Number(order.total).toFixed(2)}
                  </span>
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 text-sm text-[#e87a5c]">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              {order.payment_method === 'gcash' ? (
                <>
                  {/* The receipt is what the cashier is actually judging. */}
                  <div className="mt-4 bg-[#0a0d0a] border border-semantic-gcash/30 rounded-2xl p-4">
                    <div className="text-xs uppercase tracking-[0.25em] opacity-40 mb-3">
                      GCash receipt
                    </div>

                    {proofLoading ? (
                      <div className="h-40 grid place-items-center opacity-50">
                        <Loader2 className="animate-spin" size={20} />
                      </div>
                    ) : proofUrl ? (
                      <button
                        onClick={() => setZoomed(true)}
                        className="relative w-full group"
                        title="Tap to enlarge"
                      >
                        <img
                          src={proofUrl}
                          alt="GCash receipt uploaded by the diner"
                          className="w-full max-h-72 object-contain rounded-xl bg-black/40"
                        />
                        <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-[11px]">
                          <Maximize2 size={11} /> Enlarge
                        </span>
                      </button>
                    ) : order.proof_path ? (
                      <div className="flex items-start gap-2 text-sm text-[#e87a5c] py-3">
                        <ImageOff size={16} className="mt-0.5 shrink-0" />
                        <span>
                          The diner recorded a receipt but the image can't be loaded.
                          Ask to see their GCash app instead.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-sm py-3 opacity-70">
                        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
                        <span>
                          Waiting for the diner to upload their receipt — this
                          updates on its own.
                        </span>
                      </div>
                    )}

                    <div className="mt-3 text-[11px] opacity-50">
                      Check the amount matches{' '}
                      <b className="opacity-90">₱{Number(order.total).toFixed(2)}</b>{' '}
                      and that the reference is readable.
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    <div className="text-xs uppercase tracking-[0.25em] opacity-40 mb-1">
                      Settle this ticket
                    </div>

                    <button
                      onClick={() => settle('gcash')}
                      disabled={busy || !proofUrl}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-semantic-gcash text-white disabled:opacity-30 text-left"
                    >
                      <ShieldCheck size={20} className="shrink-0" />
                      <span>
                        <span className="block text-sm font-medium">Receipt looks right</span>
                        <span className="block text-[11px] opacity-80">
                          Confirm as paid by GCash
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => settle('gcash', 'verified', { inPerson: true })}
                      disabled={busy}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[#e8dfc8]/20 hover:bg-[#e8dfc8]/5 disabled:opacity-40 text-left"
                    >
                      <Smartphone size={20} className="shrink-0 opacity-70" />
                      <span>
                        <span className="block text-sm font-medium">
                          Checked their GCash app
                        </span>
                        <span className="block text-[11px] opacity-60">
                          No usable screenshot, but you saw the payment
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        settle('gcash', 'needs_review', {
                          note: 'Diner says paid; no verifiable proof at the counter.',
                        })
                      }
                      disabled={busy}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[#e8a84a]/40 bg-[#e8a84a]/10 hover:bg-[#e8a84a]/20 disabled:opacity-40 text-left"
                    >
                      <FlagTriangleRight size={20} className="shrink-0 text-[#e8a84a]" />
                      <span>
                        <span className="block text-sm font-medium">Release &amp; flag</span>
                        <span className="block text-[11px] opacity-60">
                          Give them the food; the owner reconciles it later
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => settle('cash')}
                      disabled={busy}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[#e8dfc8]/15 hover:bg-[#e8dfc8]/5 disabled:opacity-40 text-left"
                    >
                      <Banknote size={20} className="shrink-0 text-semantic-good" />
                      <span>
                        <span className="block text-sm font-medium">Paying cash instead</span>
                        <span className="block text-[11px] opacity-60">
                          Switch the method and take cash now
                        </span>
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-5">
                  <div className="text-xs uppercase tracking-[0.25em] opacity-40 mb-3">
                    Settle this ticket
                  </div>
                  <button
                    onClick={() => settle('cash')}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-semantic-cash text-white disabled:opacity-40"
                  >
                    <Banknote size={22} />
                    <span className="font-medium">
                      Confirm ₱{Number(order.total).toFixed(2)} in cash
                    </span>
                  </button>
                  <button
                    onClick={() => settle('gcash')}
                    disabled={busy}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#e8dfc8]/15 text-sm hover:bg-[#e8dfc8]/5 disabled:opacity-40"
                  >
                    <Smartphone size={16} /> They're paying by GCash instead
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {stage === 'receipt' && order && (
            <motion.div
              key="receipt"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-sm"
            >
              <button
                onClick={reset}
                className="text-xs opacity-50 hover:opacity-100 flex items-center gap-1.5 mb-4 print:hidden"
              >
                <ArrowLeft size={13} /> Next customer
              </button>
              {order.payment_status === 'needs_review' && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-[#e8a84a]/15 border border-[#e8a84a]/40 text-xs print:hidden">
                  <FlagTriangleRight size={15} className="mt-0.5 shrink-0 text-[#e8a84a]" />
                  <span className="opacity-80">
                    Flagged for the owner to reconcile against the GCash history.
                  </span>
                </div>
              )}
              <Receipt order={order} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      )}

      {/* Full-screen proof, for reading a reference number off a small photo. */}
      {zoomed && proofUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4 print:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setZoomed(false)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <img
            src={proofUrl}
            alt="GCash receipt, enlarged"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The order queue on the counter screen.
 *
 * Loads and subscribes on its own so the counter does not pay for the orders
 * feed until somebody actually opens the Kitchen tab.
 */
function KitchenOrders() {
  const orders = useOrdersStore((s) => s.orders);
  const loadRecent = useOrdersStore((s) => s.loadRecent);
  const subscribe = useOrdersStore((s) => s.subscribe);

  useEffect(() => {
    loadRecent();
    return subscribe();
  }, [loadRecent, subscribe]);

  return <KitchenBoard orders={orders} />;
}
