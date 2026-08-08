import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  BellRing,
  Check,
  ChefHat,
  Clock,
  Gift,
  Loader2,
  LogOut,
  Package,
  Tag,
  Ticket as TicketIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { SiteHeader, SiteFooter } from './SiteChrome';
import type { Order } from '../../lib/types';

/**
 * The diner's own page: sign in or sign up, then follow every order they have
 * ever placed.
 *
 * Ordering deliberately still works with no account at all. This page exists
 * for the things that need memory across visits, which a ticket code on one
 * phone cannot give: order history, payment history, loyalty, and being told
 * when a sold-out dish comes back.
 */

type Stage = { kind: 'preparing' | 'ready' | 'completed' | 'waiting' | 'cancelled'; label: string; blurb: string };

function stageOf(o: Order): Stage {
  if (o.status === 'cancelled') return { kind: 'cancelled', label: 'Cancelled', blurb: 'This order was cancelled.' };
  if (o.status === 'completed') return { kind: 'completed', label: 'Completed', blurb: 'Collected. Salamat po!' };
  if (o.status === 'ready') return { kind: 'ready', label: 'Ready', blurb: 'Ready at the counter. Show your code.' };
  if (o.status === 'preparing') return { kind: 'preparing', label: 'Preparing', blurb: 'The kitchen is cooking your order.' };
  if (o.paid_at) return { kind: 'preparing', label: 'Paid', blurb: 'Paid. The kitchen will start shortly.' };
  return { kind: 'waiting', label: 'Not yet paid', blurb: 'Show your code at the counter to pay.' };
}

const STAGE_ORDER = ['waiting', 'preparing', 'ready', 'completed'] as const;

export function AccountPage() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 md:px-8 py-10">
        {loading ? (
          <div className="py-20 grid place-items-center opacity-50">
            <Loader2 className="animate-spin" />
          </div>
        ) : user ? (
          <SignedIn email={user.email ?? ''} onSignOut={signOut} />
        ) : (
          <AuthPanel />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------- sign in/up */

function AuthPanel() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const signUp = useAuthStore((s) => s.signUpCustomer);
  const login = useAuthStore((s) => s.loginCustomer);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'up') {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) setSent(true);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full h-11 rounded-xl border border-diner-ink/15 bg-diner-card px-4 text-sm outline-none focus:border-diner-ink/45';

  if (sent) {
    return (
      <div className="max-w-md">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }} className="text-3xl">
          Check your email
        </h1>
        <p className="mt-3 opacity-75 leading-relaxed">
          We sent a confirmation link to {email}. Open it and you will be signed in.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h1
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
        className="text-4xl"
      >
        {mode === 'in' ? 'Welcome back' : 'Create an account'}
      </h1>
      <p className="mt-3 opacity-70 leading-relaxed">
        You never need an account to order. One only adds things a single ticket code cannot:
        every order you have placed, live updates while it is cooking, loyalty rewards, and a
        message when a sold-out dish comes back.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-3">
        <input
          className={field}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          className={field}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          required
          minLength={6}
        />
        {error && <p className="text-sm text-diner-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-full bg-diner-ink text-diner-ground flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in');
          setError(null);
        }}
        className="mt-4 text-sm text-diner-accent hover:underline"
      >
        {mode === 'in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
      </button>

      <p className="mt-8 text-sm opacity-60">
        Or just{' '}
        <Link to="/menu" className="text-diner-accent hover:underline">
          order as a guest
        </Link>
        . It works exactly the same at the counter.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- signed in */

function SignedIn({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loyalty, setLoyalty] = useState<{ completed: number; until_next: number } | null>(null);
  const [promos, setPromos] = useState<{ code: string; label: string }[]>([]);
  const [alerts, setAlerts] = useState<{ dish_id: string; notified_at: string | null }[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);

  const role = useAuthStore((s) => s.profile?.role);
  const isStaff = role === 'admin' || role === 'cashier';

  /**
   * This page shows the signed-in customer's OWN orders, so the filter has to
   * be written here explicitly.
   *
   * Leaving it off did not look broken, because the access rules still returned
   * rows: an owner is staff and may read every order in the shop, and anybody
   * at all may read orders from the last 24 hours, which is what lets a guest
   * ticket follow itself. So "My orders" quietly listed other people's orders
   * while the loyalty count, which does filter by customer, disagreed with it.
   * Access rules decide what you MAY read, not what this screen MEANS.
   */
  const loadOrders = async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      setOrders([]);
      return;
    }
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', uid)
      .order('created_at', { ascending: false })
      .limit(30);
    setOrders((data ?? []) as Order[]);
  };

  useEffect(() => {
    loadOrders();

    supabase.rpc('my_loyalty').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setLoyalty({ completed: row.completed, until_next: row.until_next });
    });

    supabase
      .from('promo_codes')
      .select('code, label')
      .eq('active', true)
      .then(({ data }) => setPromos((data ?? []) as { code: string; label: string }[]));

    supabase
      .from('stock_alerts')
      .select('dish_id, notified_at')
      .then(({ data }) => setAlerts((data ?? []) as { dish_id: string; notified_at: string | null }[]));

    // Live: the card moves through Preparing and Ready without a refresh,
    // which is the whole reason this page is worth opening while you wait.
    const channel = supabase
      .channel('my-orders')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const claim = async () => {
    setClaiming(true);
    const { data, error } = await supabase.rpc('claim_loyalty_reward');
    setClaiming(false);
    if (!error && data) setClaimed(data as string);
  };

  const restocked = alerts.filter((a) => a.notified_at);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
            className="text-4xl"
          >
            Your orders
          </h1>
          <p className="mt-1.5 opacity-60 text-sm">{email}</p>
        </div>
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-diner-ink/20 hover:bg-diner-ink hover:text-diner-ground"
        >
          <LogOut size={14} /> Sign out
        </button>
      </header>

      {/* A staff account is not a customer. create_ticket() deliberately leaves
          customer_id empty when a signed-in member of staff checks out, so a
          cashier testing the storefront does not quietly bank orders and
          loyalty against their own account. Without saying so, this page looks
          broken to the one person most likely to be looking at it: the owner. */}
      {isStaff && (
        <section className="rounded-3xl border border-diner-accent/30 bg-diner-accent/5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Gift size={16} className="text-diner-accent" /> This is a staff account
          </h2>
          <p className="mt-2 text-sm opacity-70 leading-relaxed">
            Orders you place while signed in here are not attached to you, so this
            page stays empty and no loyalty is counted. That is deliberate: it keeps
            staff testing out of the shop's customer figures. To see the customer
            experience, sign out and order as a guest, or use a separate customer
            account.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------- loyalty */}
      {!isStaff && loyalty && (
        <section className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Gift size={16} className="text-diner-accent" /> Loyalty
          </h2>
          <div className="mt-3 flex items-center gap-1.5" aria-label={`${loyalty.completed % 5} of 5 stamps`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`w-8 h-8 rounded-full grid place-items-center border ${
                  i < loyalty.completed % 5
                    ? 'bg-diner-accent border-diner-accent text-white'
                    : 'border-diner-ink/20 opacity-45'
                }`}
              >
                <Check size={14} />
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm opacity-70">
            {loyalty.completed} completed {loyalty.completed === 1 ? 'order' : 'orders'}.{' '}
            {loyalty.completed >= 5
              ? 'You have earned a reward.'
              : `${loyalty.until_next} more and you earn 20 pesos off.`}
          </p>
          {loyalty.completed >= 5 && !claimed && (
            <button
              onClick={claim}
              disabled={claiming}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-diner-ink text-diner-ground text-sm disabled:opacity-60"
            >
              {claiming && <Loader2 size={14} className="animate-spin" />} Claim my reward
            </button>
          )}
          {claimed && (
            <p className="mt-3 text-sm text-semantic-cash">
              Your code is <strong className="font-mono tracking-wider">{claimed}</strong>. Use it at checkout.
            </p>
          )}
        </section>
      )}

      {/* -------------------------------------------------------- promos */}
      {promos.length > 0 && (
        <section className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Tag size={16} className="text-diner-accent" /> Promotions running now
          </h2>
          <ul className="mt-3 space-y-2">
            {promos.map((p) => (
              <li key={p.code} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono tracking-wider">{p.code}</span>
                <span className="opacity-70">{p.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------ restock alerts */}
      {restocked.length > 0 && (
        <section className="rounded-3xl border border-semantic-cash/40 bg-diner-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-semantic-cash">
            <BellRing size={16} /> Back on the menu
          </h2>
          <p className="mt-2 text-sm opacity-75">
            {restocked.length === 1 ? 'A dish you' : 'Dishes you'} asked about{' '}
            {restocked.length === 1 ? 'is' : 'are'} available again.{' '}
            <Link to="/menu" className="text-diner-accent hover:underline">
              See the menu
            </Link>
          </p>
        </section>
      )}

      {/* -------------------------------------------------------- orders */}
      <section>
        <h2 className="text-[11px] tracking-[0.25em] uppercase opacity-55 mb-3">Order history</h2>

        {orders === null ? (
          <div className="py-10 grid place-items-center opacity-50">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : orders.length === 0 ? (
          <p className="opacity-65 text-sm">
            No orders yet.{' '}
            <Link to="/menu" className="text-diner-accent hover:underline">
              See what is cooking today
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const stage = stageOf(order);
  const stepIndex = STAGE_ORDER.indexOf(stage.kind as (typeof STAGE_ORDER)[number]);

  const tone =
    stage.kind === 'ready'
      ? 'text-semantic-cash border-semantic-cash/40'
      : stage.kind === 'cancelled'
        ? 'text-diner-accent border-diner-accent/40'
        : 'text-diner-ink border-diner-ink/20';

  return (
    <li className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-mono tracking-widest">{order.ticket_code}</span>
        <span className={`text-xs px-3 py-1 rounded-full border ${tone}`}>{stage.label}</span>
      </div>

      <p className="mt-2 text-sm opacity-75 leading-relaxed">
        {(order.items ?? []).map((i) => `${i.qty}x ${i.name}`).join(', ')}
      </p>

      {/* progress rail: waiting, preparing, ready, completed */}
      {stage.kind !== 'cancelled' && (
        <div className="mt-4 flex items-center gap-1.5">
          {STAGE_ORDER.map((s, i) => (
            <React.Fragment key={s}>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  i <= stepIndex ? 'bg-diner-accent' : 'bg-diner-ink/15'
                }`}
              />
              {i < STAGE_ORDER.length - 1 && (
                <span className={`flex-1 h-0.5 ${i < stepIndex ? 'bg-diner-accent' : 'bg-diner-ink/12'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider opacity-45">
        <span>Paid</span>
        <span>Preparing</span>
        <span>Ready</span>
        <span>Collected</span>
      </div>

      <p className="mt-3 text-sm opacity-70 flex items-center gap-1.5">
        {stage.kind === 'preparing' && <ChefHat size={14} />}
        {stage.kind === 'ready' && <Package size={14} />}
        {stage.kind === 'waiting' && <TicketIcon size={14} />}
        {stage.blurb}
      </p>

      <div className="mt-3 pt-3 border-t border-diner-ink/10 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="opacity-60 flex items-center gap-1.5">
          <Clock size={13} />
          {new Date(order.created_at).toLocaleString()}
        </span>
        <span className="flex items-center gap-3">
          <span className="opacity-60 capitalize">
            {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
            {order.paid_at ? '' : ', unpaid'}
          </span>
          <span style={{ fontFamily: 'var(--font-display)' }} className="text-lg tabular-nums">
            ₱{Number(order.total).toFixed(2)}
          </span>
        </span>
      </div>
    </li>
  );
}
