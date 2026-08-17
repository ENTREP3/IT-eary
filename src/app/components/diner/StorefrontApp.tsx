import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
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
  Search,
  Heart,
  Star,
  Share2,
  History,
  Tag,
  Flame,
  BellRing,
  UserRound,
} from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { usePaymentStore } from '../../store/paymentStore';
import { useReviewStore } from '../../store/reviewStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Receipt } from '../Receipt';
import { ImageWithFallback } from '../sigma/ImageWithFallback';
import { Wordmark, Tagline } from '../site/SiteChrome';
import {
  getFavourites,
  getHistory,
  getMyRating,
  hasOrdered,
  rememberOrder,
  saveRating,
  subscribePrefs,
  toggleFavourite,
  type PastOrder,
} from '../../lib/localPrefs';
import type { Dish } from '../data';
import type { Order, PaymentMethod } from '../../lib/types';

/** Re-renders whatever reads it whenever the device's own preferences change. */
function usePrefs<T>(read: () => T): T {
  return useSyncExternalStore(subscribePrefs, read, read);
}

type Stage = 'menu' | 'cart' | 'ticket';
type CartLine = { dish: Dish; qty: number };

/**
 * Collection times offered at checkout, in minutes from now.
 *
 * Letting the diner say "in an hour" is what stops everyone arriving at noon
 * at once, and it tells the kitchen how to pace the cooking.
 */
const PICKUP_CHOICES: { label: string; minutes: number | null }[] = [
  { label: 'As soon as it is ready', minutes: null },
  { label: 'In 30 minutes', minutes: 30 },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 2 hours', minutes: 120 },
];

/**
 * The diner-facing web storefront — the browser twin of the Flutter app.
 *
 * Deliberately mirrors the mobile flow rather than inventing a second one:
 * browse → cart → choose a method → ticket code → (GCash) upload the receipt.
 *
 * An account is optional and always will be: the ticket code carries identity,
 * so ordering never requires signing up. Signing in only adds what needs memory
 * across visits, such as history and live order tracking.
 */
export function StorefrontApp() {
  const user = useAuthStore((s) => s.user);
  const categories = useKarinderyaStore((s) => s.categories);
  const dishes = useKarinderyaStore((s) => s.dishes);
  const menuLoaded = useKarinderyaStore((s) => s.loaded);

  const [stage, setStage] = useState<Stage>('menu');
  const [cat, setCat] = useState<string>('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const favourites = usePrefs(getFavourites);
  const history = usePrefs(getHistory);

  /**
   * The best seller *within each category*, taken from the live sales column.
   *
   * Ranking across the whole menu would be useless to someone browsing: drinks
   * outsell every main dish, so the badge would only ever appear on Inumin and
   * a diner looking at Ulam would never see one.
   */
  const bestsellerIds = useMemo(() => {
    const top = new Map<string, { id: string; sold: number }>();
    for (const d of dishes) {
      if (!d.available || d.soldToday <= 0) continue;
      const current = top.get(d.category);
      if (!current || d.soldToday > current.sold) top.set(d.category, { id: d.id, sold: d.soldToday });
    }
    return new Set([...top.values()].map((v) => v.id));
  }, [dishes]);

  // Open on a category that actually has food today. Landing on one where
  // everything is sold out reads as though the karinderya is closed.
  useEffect(() => {
    if (!categories.length || categories.includes(cat)) return;
    const stocked = categories.find((c) =>
      dishes.some((d) => d.category === c && d.available),
    );
    setCat(stocked ?? categories[0]);
  }, [categories, dishes, cat]);

  // A search looks across the whole menu; the category chips only apply when
  // nobody is searching, otherwise a hit in another category would be hidden.
  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    if (searching) {
      const q = query.trim().toLowerCase();
      return dishes.filter((d) =>
        [d.name, d.tagalog, d.description, d.category].some((f) => f?.toLowerCase().includes(q)),
      );
    }
    return dishes.filter((d) => d.category === cat);
  }, [dishes, cat, query, searching]);

  const count = cart.reduce((a, c) => a + c.qty, 0);
  const total = cart.reduce((a, c) => a + c.qty * c.dish.price, 0);

  /** Rebuilds a past order, skipping anything no longer on the menu today. */
  const reorder = (past: PastOrder) => {
    const lines: CartLine[] = [];
    let skipped = 0;
    for (const item of past.items) {
      const dish = dishes.find((d) => d.id === item.id && d.available);
      if (dish) lines.push({ dish, qty: item.qty });
      else skipped += 1;
    }
    setCart(lines);
    setHistoryOpen(false);
    setStage(lines.length ? 'cart' : 'menu');
    return skipped;
  };

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
    // The device keeps its own copy so the next visit can reorder in one tap.
    rememberOrder(o);
    setOrder(o);
    setCart([]);
    setStage('ticket');
  };

  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink">
      <header className="sticky top-0 z-20 bg-diner-ground/90 backdrop-blur border-b border-diner-ink/10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <Wordmark />

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-diner-ink/20 hover:bg-diner-ink hover:text-diner-ground transition-colors"
              >
                <History size={14} />
                <span className="hidden sm:inline">Order again</span>
              </button>
            )}
            <button
              onClick={() => setLookupOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-diner-ink/20 hover:bg-diner-ink hover:text-diner-ground transition-colors"
            >
              <TicketIcon size={14} />
              <span className="hidden sm:inline">Find my ticket</span>
            </button>

            {/* The account was reachable only from the landing page, so a diner
                already on the menu had to navigate backwards to sign in or to
                check an order they were waiting on. The menu is where people
                actually spend their time, so it needs the same door. */}
            <Link
              to="/account"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-diner-ink/20 hover:bg-diner-ink hover:text-diner-ground transition-colors"
            >
              <UserRound size={14} />
              <span className="hidden sm:inline">{user ? 'My orders' : 'Sign in'}</span>
            </Link>
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
            <Tagline className="text-4xl md:text-6xl" />
            <p className="mt-3 opacity-70 max-w-lg text-sm md:text-base">
              Only what's cooking right now. If it isn't here, it's sold out, balik ka bukas.
            </p>

            <label className="mt-6 flex items-center gap-2.5 h-12 px-4 rounded-full bg-diner-card border border-diner-ink/15 focus-within:border-diner-ink/45 max-w-md">
              <Search size={16} className="opacity-50 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for an ulam, silog or drink"
                className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-50"
                aria-label="Search the menu"
              />
              {searching && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="opacity-50 hover:opacity-100">
                  <X size={15} />
                </button>
              )}
            </label>

            {!searching && (
              <nav className="mt-4 flex gap-2 flex-wrap">
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
            )}

            {searching && (
              <p className="mt-4 text-sm opacity-60">
                {visible.length === 0
                  ? `Nothing on today's menu matches "${query.trim()}".`
                  : `${visible.length} ${visible.length === 1 ? 'match' : 'matches'} across the whole menu`}
              </p>
            )}
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
                    bestseller={bestsellerIds.has(d.id)}
                    favourite={favourites.includes(d.id)}
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
        {historyOpen && (
          <HistorySheet
            history={history}
            onClose={() => setHistoryOpen(false)}
            onReorder={reorder}
          />
        )}
      </AnimatePresence>

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
  bestseller,
  favourite,
}: {
  dish: Dish;
  qty: number;
  onAdd: () => void;
  onSub: () => void;
  bestseller: boolean;
  favourite: boolean;
}) {
  const [rateOpen, setRateOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const myRating = usePrefs(() => getMyRating(dish.id));
  const canRate = usePrefs(() => hasOrdered(dish.id));

  // The published average, from everyone, not just this device.
  const rating = useReviewStore((s) => s.ratings[dish.id]);
  const comments = useReviewStore((s) => s.reviews[dish.id]);
  const loadFor = useReviewStore((s) => s.loadFor);

  // "Few left" only means something when the kitchen actually set a limit.
  const fewLeft =
    dish.available && typeof dish.stockCount === 'number' && dish.stockCount > 0 && dish.stockCount <= 3;

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

        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {bestseller && dish.available && (
            <Badge tone="accent" icon={<Flame size={11} />}>
              Bestseller
            </Badge>
          )}
          {fewLeft && (
            <Badge tone="warn">
              Only {dish.stockCount} left
            </Badge>
          )}
        </div>

        <button
          onClick={() => toggleFavourite(dish.id)}
          aria-label={favourite ? `Remove ${dish.name} from favourites` : `Save ${dish.name} to favourites`}
          aria-pressed={favourite}
          className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center bg-diner-ground/85 backdrop-blur border border-diner-ink/10 hover:bg-diner-ground"
        >
          <Heart
            size={15}
            className={favourite ? 'text-diner-accent' : 'opacity-55'}
            fill={favourite ? 'currentColor' : 'none'}
          />
        </button>

        {!dish.available && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="px-3 py-1 bg-diner-ink text-diner-ground text-xs tracking-[0.25em] uppercase -rotate-3">
              Sold out
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        {!dish.available && <RestockAlert dish={dish} />}
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

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[22px]">
          {rating ? (
            <button
              onClick={() => {
                if (!comments) loadFor(dish.id);
                setReviewsOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 hover:opacity-80"
            >
              <Stars value={Math.round(rating.average)} />
              <span className="text-xs tabular-nums">{rating.average.toFixed(1)}</span>
              <span className="text-xs opacity-55">
                ({rating.total} {rating.total === 1 ? 'rating' : 'ratings'})
              </span>
            </button>
          ) : (
            <span className="text-xs opacity-45">No ratings yet</span>
          )}

          {canRate ? (
            <button
              onClick={() => setRateOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-diner-accent hover:underline"
            >
              <Star size={12} /> {myRating ? 'Edit your rating' : 'Rate this dish'}
            </button>
          ) : (
            <span className="text-xs opacity-45">Order it to leave a rating</span>
          )}
        </div>

        <AnimatePresence>
          {reviewsOpen && comments && comments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ul className="mt-3 pt-3 border-t border-diner-ink/10 space-y-3">
                {comments.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center gap-2">
                      <Stars value={r.rating} size={11} />
                      <span className="text-[11px] opacity-55">
                        {r.author_name || 'A diner'} · {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.comment && <p className="text-xs opacity-75 mt-0.5">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {rateOpen && (
            <RateSheet dish={dish} existing={myRating} onClose={() => setRateOpen(false)} />
          )}
        </AnimatePresence>

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

/**
 * Turns a lost sale into a queued one.
 *
 * Needs an account, because there is nowhere to send the news otherwise. When
 * the owner puts the dish back on the menu, a database trigger flags every
 * waiting request and the diner sees it on their orders page.
 */
function RestockAlert({ dish }: { dish: Dish }) {
  const user = useAuthStore((s) => s.user);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('stock_alerts')
      .select('dish_id')
      .eq('dish_id', dish.id)
      .then(({ data }) => setAsked((data ?? []).length > 0));
  }, [user, dish.id]);

  if (!user) {
    return (
      <p className="mb-3 text-xs opacity-60">
        <Link to="/account" className="text-diner-accent hover:underline">
          Sign in
        </Link>{' '}
        to be told when this is back.
      </p>
    );
  }

  if (asked) {
    return (
      <p className="mb-3 text-xs text-semantic-cash flex items-center gap-1.5">
        <Check size={13} /> We will tell you when this is back.
      </p>
    );
  }

  return (
    <button
      onClick={async () => {
        setBusy(true);
        const { error } = await supabase
          .from('stock_alerts')
          .insert({ customer_id: user.id, dish_id: dish.id });
        setBusy(false);
        if (!error) setAsked(true);
      }}
      disabled={busy}
      className="mb-3 inline-flex items-center gap-1.5 text-xs text-diner-accent hover:underline disabled:opacity-50"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />}
      Tell me when this is back
    </button>
  );
}

function Badge({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: 'accent' | 'warn';
  icon?: React.ReactNode;
}) {
  const skin =
    tone === 'accent'
      ? 'bg-diner-accent text-white'
      : 'bg-diner-ground text-diner-ink border border-diner-ink/15';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-[0.08em] uppercase ${skin}`}
    >
      {icon}
      {children}
    </span>
  );
}

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= value ? 'text-diner-accent' : 'opacity-25'}
          fill={n <= value ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

/**
 * Rating is gated on this device having actually bought the dish, which mirrors
 * the rule the server will enforce once ratings live in Postgres: only a
 * settled ticket can leave one, so reviews cannot be manufactured.
 */
function RateSheet({
  dish,
  existing,
  onClose,
}: {
  dish: Dish;
  existing?: { stars: number; comment: string };
  onClose: () => void;
}) {
  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = useReviewStore((s) => s.submit);

  // The most recent settled ticket on this device that contained the dish.
  const ticket = getHistory().find((o) => o.items.some((i) => i.id === dish.id))?.ticket_code ?? '';

  const submit = async () => {
    if (!stars || !ticket) return;
    setBusy(true);
    setError(null);
    try {
      await post({ ticketCode: ticket, dishId: dish.id, rating: stars, comment: comment.trim() });
      // Kept locally too, so the card can show "Edit your rating" next time.
      saveRating({ dishId: dish.id, stars, comment: comment.trim(), at: new Date().toISOString(), ticket });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post that rating.');
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t border-diner-ink/10">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setStars(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
              <Star
                size={22}
                className={n <= stars ? 'text-diner-accent' : 'opacity-30'}
                fill={n <= stars ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Anything you want to say about it? (optional)"
          className="mt-2.5 w-full rounded-xl border border-diner-ink/15 bg-diner-ground px-3 py-2 text-sm outline-none focus:border-diner-ink/40 resize-none"
        />
        <p className="mt-1.5 text-[11px] opacity-50">
          Posted against ticket {ticket || 'on this device'}. The counter has to have settled it.
        </p>
        {error && <p className="mt-1.5 text-xs text-diner-accent">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            onClick={submit}
            disabled={!stars || busy}
            className="flex-1 py-2 rounded-full bg-diner-ink text-diner-ground text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {existing ? 'Update rating' : 'Post rating'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-diner-ink/20 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** Past tickets held on this device, each one re-orderable in a single tap. */
function HistorySheet({
  history,
  onClose,
  onReorder,
}: {
  history: PastOrder[];
  onClose: () => void;
  onReorder: (o: PastOrder) => number;
}) {
  const [note, setNote] = useState<string | null>(null);

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
        className="w-full md:max-w-lg bg-diner-ground md:rounded-3xl rounded-t-3xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-diner-ink/10">
          <div className="text-xs tracking-[0.3em] uppercase opacity-60">Your recent orders</div>
          <button onClick={onClose} className="p-1 hover:opacity-70" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-3">
          <p className="text-xs opacity-55 leading-relaxed">
            Kept on this phone only, never on our system. Clearing your browser data removes them.
          </p>
          {note && <p className="text-sm text-diner-accent">{note}</p>}

          {history.map((o) => (
            <div key={o.ticket_code} className="p-4 rounded-2xl bg-diner-card border border-diner-ink/10">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm tracking-widest">{o.ticket_code}</span>
                <span className="text-xs opacity-55">
                  {new Date(o.placed_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1.5 text-sm opacity-75 leading-relaxed">
                {o.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span style={{ fontFamily: 'var(--font-display)' }} className="text-lg tabular-nums">
                  ₱{o.total.toFixed(2)}
                </span>
                <button
                  onClick={() => {
                    const skipped = onReorder(o);
                    if (skipped) {
                      setNote(
                        `${skipped} ${skipped === 1 ? 'item is' : 'items are'} not on today's menu, so we left ${skipped === 1 ? 'it' : 'them'} out.`,
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-diner-ink text-diner-ground text-sm"
                >
                  <RefreshCw size={14} /> Order this again
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
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

  // Null means "as soon as it is ready", which is what most walk-ins want.
  const [pickup, setPickup] = useState<number | null>(null);
  const [promo, setPromo] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [applied, setApplied] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  /**
   * The discount is quoted by the same database function that will charge it,
   * so the number shown here is the number the diner actually pays. The client
   * never computes it.
   */
  const checkPromo = async () => {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('preview_promo', {
        p_code: code,
        p_subtotal: total,
      });
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.valid) {
        setApplied({ code, discount: Number(row.discount), label: row.label ?? '' });
      } else {
        setApplied(null);
        setPromoError(row?.reason || 'That code cannot be used right now.');
      }
    } catch {
      setApplied(null);
      setPromoError('Could not check that code.');
    } finally {
      setPromoBusy(false);
    }
  };

  // A code priced against a different subtotal is no longer trustworthy.
  useEffect(() => {
    setApplied(null);
    setPromoError(null);
  }, [total]);

  const payable = Math.max(0, total - (applied?.discount ?? 0));

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
        p_promo_code: applied?.code ?? null,
        p_pickup_at: pickup === null ? null : new Date(Date.now() + pickup * 60_000).toISOString(),
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
              When will you collect?
            </div>
            <div className="flex gap-2 flex-wrap">
              {PICKUP_CHOICES.map((c) => (
                <button
                  key={c.minutes ?? 'asap'}
                  onClick={() => setPickup(c.minutes)}
                  className={`px-3.5 py-2 rounded-full text-sm border transition-colors ${
                    pickup === c.minutes
                      ? 'bg-diner-ink text-diner-ground border-diner-ink'
                      : 'bg-diner-card border-diner-ink/15 hover:border-diner-ink/40'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

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
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase opacity-55 mb-2">
              Have a promo code?
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 h-11 px-3.5 rounded-xl border border-diner-ink/15 bg-diner-card focus-within:border-diner-ink/40">
                <Tag size={15} className="opacity-50 shrink-0" />
                <input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && checkPromo()}
                  placeholder="e.g. SULIT10"
                  className="flex-1 bg-transparent outline-none text-sm tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal placeholder:opacity-50"
                  aria-label="Promo code"
                />
              </div>
              <button
                onClick={checkPromo}
                disabled={promoBusy || !promo.trim()}
                className="px-4 rounded-xl border border-diner-ink/25 text-sm disabled:opacity-40"
              >
                {promoBusy ? <Loader2 size={15} className="animate-spin" /> : 'Apply'}
              </button>
            </div>
            {promoError && <p className="mt-1.5 text-xs text-diner-accent">{promoError}</p>}
            {applied && (
              <p className="mt-1.5 text-xs text-semantic-cash flex items-center gap-1.5">
                <Check size={13} />
                {applied.label || `${applied.code} applied`}
              </p>
            )}
          </div>

          {applied && (
            <div className="space-y-1 text-sm pt-1">
              <div className="flex items-center justify-between opacity-65">
                <span>Subtotal</span>
                <span className="tabular-nums">₱{total.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-semantic-cash">
                <span>Discount ({applied.code})</span>
                <span className="tabular-nums">-₱{applied.discount.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="opacity-60 text-sm">Total</span>
            <span
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
              className="text-3xl tabular-nums"
            >
              ₱{payable.toFixed(2)}
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

/**
 * Sharing the order is the cheapest marketing the shop has: the person who
 * receives it lands on the menu. Uses the phone's own share sheet where it
 * exists, and quietly falls back to the clipboard on desktop.
 */
function ShareButton({ order }: { order: Order }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/menu`;
    const text = `I just ordered from Bencris. ${order.items
      .slice(0, 2)
      .map((i) => i.name)
      .join(', ')}${order.items.length > 2 ? ' and more' : ''}. See what is cooking today:`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bencris', text, url });
        return;
      } catch {
        /* the diner dismissed the share sheet, which is not an error */
      }
    }
    await navigator.clipboard?.writeText(`${text} ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={share} className="inline-flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100">
      <Share2 size={13} /> {copied ? 'Link copied' : 'Share'}
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
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            onClick={() => navigator.clipboard?.writeText(order.ticket_code)}
            className="inline-flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100"
          >
            <Copy size={13} /> Copy code
          </button>
          <ShareButton order={order} />
        </div>
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
