import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { deviceToken } from '../../lib/localPrefs';
import type { Order } from '../../lib/types';
import { humanError } from '../../lib/errors';
import { passwordProblem } from '../../lib/password';
import { NotifyToggle } from './NotifyToggle';
import { refreshPushRegistration } from '../../lib/push';
import { syncFavourites } from '../../lib/favourites';
import { displayName } from '../../lib/displayName';
import { RateFromOrder } from './RateFromOrder';
import { MyDetails } from './MyDetails';
import { ReceiptDialog } from './ReceiptDialog';

/**
 * The diner's own page: sign in or sign up, then follow every order they have
 * ever placed.
 *
 * Ordering deliberately still works with no account at all. This page exists
 * for the things that need memory across visits, which a ticket code on one
 * phone cannot give: order history, payment history, loyalty, and being told
 * when a sold-out dish comes back.
 */

type Stage = {
  kind: 'preparing' | 'ready' | 'completed' | 'waiting' | 'cancelled' | 'refunded' | 'expired';
  label: string;
  blurb: string;
};

function stageOf(o: Order): Stage {
  if (o.status === 'expired')
    return {
      kind: 'expired',
      label: 'Expired',
      blurb: 'Nobody collected this one, so it went back on the menu. Order again if you still want it.',
    };
  if (o.status === 'refunded')
    return { kind: 'refunded', label: 'Refunded', blurb: 'This order was refunded. The money has been returned to you.' };
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
          <>
            {/* Above the sign-in, not below it.
                A guest arriving here is usually not here to make an account —
                they are here because they ordered, closed the page, and want to
                know whether the food is ready. Making them scroll past a signup
                form to find that out would be answering a question nobody
                asked. */}
            <GuestOrders />
            <AuthPanel />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}


/**
 * The tickets this device raised, for somebody who never made an account.
 *
 * Before this, a guest who closed the page and had not copied the code had
 * nothing at all. The counter could look the ticket up, but had no way to tell
 * whether the person asking was the person who ordered it — the code was the
 * only proof, and it was gone. The device holds a token now, so it can ask the
 * database for its own tickets and get an answer nobody else could get.
 *
 * Refreshed on a timer rather than pushed: Realtime authorises with the JWT in
 * the connection and a guest has none, so there is nothing for it to check the
 * row against. One request every ten seconds while this page is open is a fair
 * price for tickets that are nobody else's business.
 */
function GuestOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    let stop = false;

    const load = async () => {
      const { data } = await supabase.rpc('my_orders', {
        p_device_token: deviceToken(),
      });
      if (!stop) setOrders((data ?? []) as Order[]);
    };

    load();
    const id = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Nothing yet, or nothing ever: either way there is no reason to take up the
  // top of the page with an empty box.
  if (!orders?.length) return null;

  const live = orders.filter(
    (o) =>
      o.status !== 'completed' &&
      o.status !== 'cancelled' &&
      o.status !== 'refunded' &&
      o.status !== 'expired',
  );
  const past = orders.filter(
    (o) =>
      o.status === 'completed' ||
      o.status === 'cancelled' ||
      o.status === 'refunded' ||
      o.status === 'expired',
  );

  return (
    <section className="mb-10">
      <h1
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
        className="text-3xl"
      >
        {live.length ? 'Your order' : 'What you ordered here'}
      </h1>
      <p className="mt-1.5 text-sm opacity-65 leading-relaxed">
        Kept on this device, so you did not have to write the code down. Only
        this phone can see them.
      </p>

      <div className="mt-5 space-y-2.5">
        {(live.length ? live : past.slice(0, 5)).map((o) => (
          <article
            key={o.id}
            className="rounded-2xl bg-diner-card border border-diner-ink/10 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono tracking-[0.2em] text-sm">{o.ticket_code}</span>
              <GuestStatus order={o} />
            </div>

            <p className="mt-2 text-sm opacity-70 leading-relaxed">
              {(o.items ?? []).map((i) => `${i.qty} × ${i.name}`).join(', ')}
            </p>

            <div className="mt-2 flex items-center justify-between gap-3 text-xs opacity-55">
              <span>{new Date(o.created_at).toLocaleString()}</span>
              <span className="tabular-nums">₱{Number(o.total).toFixed(2)}</span>
            </div>
          </article>
        ))}
      </div>

      {live.length > 0 && past.length > 0 && (
        <p className="mt-3 text-xs opacity-45">
          {past.length} older {past.length === 1 ? 'order' : 'orders'} on this device.
        </p>
      )}
    </section>
  );
}

/** Where the ticket has got to, in the words a diner would use. */
function GuestStatus({ order }: { order: Order }) {
  const paid = !!order.paid_at;
  const [label, tone] =
    order.status === 'expired'
      ? ['Expired', 'opacity-50']
      : order.status === 'refunded'
      ? ['Refunded', 'opacity-50']
      : order.status === 'cancelled'
      ? ['Cancelled', 'opacity-50']
      : order.status === 'completed'
        ? ['Collected', 'opacity-60']
        : order.status === 'ready'
          ? ['Ready to collect', 'text-semantic-cash']
          : order.status === 'preparing'
            ? ['Being cooked', 'text-diner-accent']
            : paid
              ? ['Paid, waiting for the kitchen', 'text-semantic-cash']
              : ['Pay at the counter', 'text-diner-accent'];

  return <span className={`text-xs ${tone}`}>{label}</span>;

}
/* -------------------------------------------------------------- sign in/up */

function AuthPanel() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Only meaningful while making an account. Kept in one object so the
  // sign-in form is not carrying six unused pieces of state.
  const [details, setDetails] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    nickname: '',
    phone: '',
  });
  const set = (k: keyof typeof details) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((d) => ({ ...d, [k]: e.target.value }));


  const signUp = useAuthStore((s) => s.signUpCustomer);
  const login = useAuthStore((s) => s.loginCustomer);
  const sendReset = useAuthStore((s) => s.sendPasswordReset);

  /**
   * Sends the reset email, and says the same thing either way.
   *
   * Deliberately does not reveal whether the address has an account. A form
   * that says "no such email" is a way to find out who has one, which is worth
   * more to somebody guessing than it is to the person who mistyped.
   */
  const forgot = async () => {
    const address = email.trim();
    if (!address) {
      setError('Type your email address first, then ask for a reset.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendReset(address);
    } catch {
      // Swallowed on purpose, for the same reason: a failure here would
      // distinguish a real address from an unknown one.
    } finally {
      setBusy(false);
      setResetSent(true);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'up') {
        /*
         * The shop's own rule, checked before Supabase is asked.
         *
         * signUp() goes straight to Supabase Auth, which applies whatever
         * policy the project has rather than ours — so an account could be
         * made with a password the reset screen would later refuse. The
         * same person would then be unable to choose the password they
         * already had.
         */
        const problem = passwordProblem(password);
        if (problem) {
          setError(problem);
          setBusy(false);
          return;
        }

        const { needsConfirmation } = await signUp(email.trim(), password, details);
        if (needsConfirmation) {
          /**
           * Back to the sign-in form, holding the email they just typed.
           *
           * This used to be its own screen saying "check your email", which
           * was a dead end: somebody who opened the link in another tab came
           * back to a page with nothing on it to sign in with, and the only
           * way forward was to reload the site.
           *
           * The password is cleared because the one they chose does not work
           * until the link is opened, and leaving it filled in invites trying
           * it straight away and being turned away.
           */
          setMode('in');
          setPassword('');
          setSent(true);
        }
      } else {
        await login(email.trim(), password);

        // The device that agreed to be notified was registered against
        // whoever was signed in at the time — for most diners, the
        // anonymous guest they were before making an account. Left alone,
        // somebody who opted in as a guest and then signed up is silently
        // unreachable. Raises no prompt: it returns at once unless
        // permission was already granted.
        void refreshPushRegistration();

        // Same reason: hearts made on this device as a guest should join
        // the account rather than be stranded on the handset.
        void syncFavourites();

        /*
         * Straight to the menu.
         *
         * Somebody signing in is not here to look at their own details —
         * they came to order, and signing in was the obstacle. Leaving
         * them on the account page makes them find their own way to the
         * food, which is the one thing the storefront is for.
         */
        navigate('/menu');
      }
    } catch (err) {
      setError(humanError(err, 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full h-11 rounded-xl border border-diner-ink/15 bg-diner-card px-4 text-sm outline-none focus:border-diner-ink/45';


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


      {/*
        Says the account was made, in a way that has to be acknowledged.

        A line of text on the form was not enough. Somebody who has just
        pressed a button is looking at the button, and the form behind it
        looks much as it did before — so the account gets made twice, and the
        second attempt is refused for an address that now exists. Something
        they have to dismiss cannot be walked past, and it names the one thing
        that has to happen next: open the email.
      */}
      {sent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sent-title"
          onClick={() => setSent(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-diner-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="confirm-sent-title"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
              className="text-2xl"
            >
              Check your email
            </h2>
            <p className="mt-3 text-sm opacity-75 leading-relaxed">
              We sent a confirmation link to {email}. Open it to confirm the account, then
              sign in here.
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setSent(false)}
              className="mt-5 w-full h-11 rounded-full bg-diner-ink text-diner-ground"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-7 space-y-3">
        {/* Making an account asks for more than signing in does, which is
            the point: a form identical to the sign-in form gives no sign
            it is creating anything. */}
        {mode === 'up' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <input
                className={field}
                placeholder="First name"
                value={details.firstName}
                onChange={set('firstName')}
                autoComplete="given-name"
                required
              />
              <input
                className={field}
                placeholder="Last name"
                value={details.lastName}
                onChange={set('lastName')}
                autoComplete="family-name"
                required
              />
            </div>
            <input
              className={field}
              placeholder="Middle name (optional)"
              value={details.middleName}
              onChange={set('middleName')}
              autoComplete="additional-name"
            />


            <div>
              <input
                className={field}
                placeholder="Nickname (optional)"
                value={details.nickname}
                onChange={set('nickname')}
              />
              {/* Worth saying, now that this is the only name the diner
                  chooses. Without it the box reads as decoration. */}
              <p className="mt-1 text-xs opacity-55">
                What we will call you. Leave it blank and we will use your first name.
              </p>
            </div>
            <input
              className={field}
              placeholder="Mobile number (optional)"
              value={details.phone}
              onChange={set('phone')}
              autoComplete="tel"
              inputMode="tel"
            />
          </>
        )}

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
          minLength={8}
          maxLength={64}
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

        {mode === 'in' && !resetSent && (
          <button
            type="button"
            onClick={forgot}
            disabled={busy}
            className="w-full text-sm opacity-60 hover:opacity-100 disabled:opacity-40"
          >
            Forgot your password?
          </button>
        )}
        {resetSent && (
          <p className="text-sm text-semantic-cash leading-relaxed">
            If there is an account for that address, a reset link is on its way. It works once,
            and only for a short while.
          </p>
        )}
      </form>

      <button
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in');
          setError(null);
          setSent(false);
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
  /**
   * Rewards already earned, with the code the diner types at checkout.
   *
   * These were being fetched and dropped, so a claimed reward lived only in
   * this component's memory — reload the page and the code was gone, with no
   * way to get it back.
   */
  const [rewards, setRewards] = useState<
    { id: string; code: string; label: string; earned_at: string; redeemed_at: string | null }[]
  >([]);
  const [promos, setPromos] = useState<{ code: string; label: string }[]>([]);
  const [alerts, setAlerts] = useState<{ dish_id: string; notified_at: string | null }[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);

  const role = useAuthStore((s) => s.profile?.role);
  const profile = useAuthStore((s) => s.profile);
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
  /**
   * Reads the card, errors included.
   *
   * The `.then()` this replaces ignored the error entirely, so when the
   * function was throwing — it referenced a column that does not exist — the
   * whole section simply never rendered, with nothing said anywhere about why.
   */
  const loadLoyalty = async () => {
    const { data, error } = await supabase.rpc('my_loyalty');
    if (error) {
      console.error('[loyalty] could not be read', error);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    setLoyalty({ completed: row.completed, until_next: row.until_next });
    setRewards(row.rewards ?? []);
  };

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

    loadLoyalty();

    /**
     * The codes still worth something to this diner.
     *
     * A code is good once per account, so listing one they have already
     * claimed is an advert for a dead end — they would type it in and be told
     * no. The redemptions they can read are their own; access rules see to
     * that, so filtering here shows nobody anything new.
     */
    Promise.all([
      supabase.from('promo_codes').select('code, label').eq('active', true),
      supabase.from('promo_redemptions').select('code'),
    ]).then(([running, claimed]) => {
      const used = new Set((claimed.data ?? []).map((r) => r.code as string));
      setPromos(
        ((running.data ?? []) as { code: string; label: string }[]).filter(
          (p) => !used.has(p.code),
        ),
      );
    });

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
    if (error) {
      setClaimError(humanError(error));
      return;
    }
    if (data) {
      setClaimed(data as string);
      // Re-read the card, so the new reward joins the list that survives a
      // reload rather than living only in this component.
      await loadLoyalty();
    }
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
            Welcome back, {displayName(profile)}
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

      {/* Under the orders heading, where somebody is already thinking about
          a ticket they are waiting on. Offered here rather than raised as a
          prompt on arrival: a browser only asks once, and a refusal is
          permanent unless the diner digs into settings, so the question is
          only ever put when they have a reason to say yes. */}
      <MyDetails />

      <NotifyToggle />

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
          {/* Offered against what is actually still owed: five completed
              orders earn one reward, and the button goes once every reward
              earned has been taken. It used to hide on a local flag, so it
              came back on the next reload. */}
          {Math.floor(loyalty.completed / 5) > rewards.length && (
            <button
              onClick={claim}
              disabled={claiming}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-diner-ink text-diner-ground text-sm disabled:opacity-60"
            >
              {claiming && <Loader2 size={14} className="animate-spin" />} Claim my reward
            </button>
          )}
          {claimError && <p className="mt-3 text-sm text-diner-accent">{claimError}</p>}

          {rewards.length > 0 && (
            <div className="mt-4 pt-4 border-t border-diner-ink/10">
              <h3 className="text-xs tracking-[0.2em] uppercase opacity-55">Your rewards</h3>
              <ul className="mt-2 space-y-2">
                {rewards.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      <strong className="font-mono tracking-wider">{r.code}</strong>
                      <span className="opacity-60"> · {r.label}</span>
                    </span>
                    {r.redeemed_at ? (
                      <span className="text-xs opacity-45">Used</span>
                    ) : (
                      <span className="text-xs text-semantic-cash">Type it in at checkout</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* -------------------------------------------------------- promos */}
      {promos.length > 0 && (
        <section className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Tag size={16} className="text-diner-accent" /> Promotions running now
          </h2>
          {/* Wraps rather than sharing one line.

              The owner types these codes, and some are a sentence —
              "TEST PER ACCOUNT ONCE ONLY CLAIM". Side by side, a long code
              took the whole row and squeezed "10% off" into one character
              per line. Letting the pair wrap costs a little height on the
              rare long code and nothing at all on a short one. */}
          <ul className="mt-3 space-y-2.5">
            {promos.map((p) => (
              <li key={p.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-mono tracking-wider break-all">{p.code}</span>
                <span className="opacity-70 whitespace-nowrap">{p.label}</span>
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
  /*
   * The whole card opens the receipt, as it does on the phone.
   *
   * The website only ever showed a receipt once, in the moment after
   * ordering, and closing it was final — no way back to it, no way to
   * save it, and no way to cancel a ticket nobody had paid for yet.
   */
  const [open, setOpen] = useState(false);
  const stage = stageOf(order);
  const stepIndex = STAGE_ORDER.indexOf(stage.kind as (typeof STAGE_ORDER)[number]);

  const tone =
    stage.kind === 'ready'
      ? 'text-semantic-cash border-semantic-cash/40'
      : stage.kind === 'cancelled' || stage.kind === 'refunded' || stage.kind === 'expired'
        ? 'text-diner-accent border-diner-accent/40'
        : 'text-diner-ink border-diner-ink/20';

  return (
    <li
      onClick={() => setOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(true); }}
      aria-label={`Receipt for ${order.ticket_code}`}
      className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5 cursor-pointer hover:border-diner-ink/25 transition-colors"
    >
      {open && <ReceiptDialog order={order} onClose={() => setOpen(false)} />}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-mono tracking-widest">{order.ticket_code}</span>
        <span className={`text-xs px-3 py-1 rounded-full border ${tone}`}>{stage.label}</span>
      </div>

      <p className="mt-2 text-sm opacity-75 leading-relaxed">
        {(order.items ?? []).map((i) => `${i.qty}x ${i.name}`).join(', ')}
      </p>

      {/* progress rail: waiting, preparing, ready, completed */}
      {stage.kind !== 'cancelled' && stage.kind !== 'refunded' && stage.kind !== 'expired' && (
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

      {/* Only once the food has actually been handed over. Rating a meal
          still being cooked is rating the wait, and the database refuses
          it anyway — better not to offer than to offer and be refused. */}
      {stage.kind === 'completed' && (
        /* Stops the click reaching the card, which now opens the receipt.
           Tapping a star to rate a dish and having a dialog appear over it
           would make the stars feel broken. */
        <div onClick={(e) => e.stopPropagation()}>
          <RateFromOrder ticketCode={order.ticket_code} items={order.items ?? []} />
        </div>
      )}
    </li>
  );
}
