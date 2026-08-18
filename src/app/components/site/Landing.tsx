import React from 'react';
import { Link } from 'react-router';
import { Clock, ShieldCheck, Utensils } from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { ImageWithFallback } from '../sigma/ImageWithFallback';
import { useBusinessStore } from '../../store/businessStore';
import { SiteHeader, SiteFooter } from './SiteChrome';
import { Hero } from './Hero';
import { ReviewShowcase } from '../diner/ReviewShowcase';

/**
 * The home page a stranger lands on.
 *
 * Its whole job is to answer three questions in about five seconds: what is
 * this, is it open, and where is it. The menu is one tap away, and today's
 * dishes are previewed here so the page is never a dead end.
 */
export function Landing() {
  const biz = useBusinessStore((s) => s.profile);
  const dishes = useKarinderyaStore((s) => s.dishes);
  const loaded = useKarinderyaStore((s) => s.loaded);

  const cookingNow = dishes.filter((d) => d.available);

  const show = biz.storefront;

  /**
   * Under "Best sellers", only the dishes the owner marked as such.
   *
   * They used to lead a list that the rest of the menu then filled out, which
   * made the heading a lie: five picks and eight tiles meant three dishes were
   * being called best sellers by nobody. If the owner marked five, the front
   * page shows five and the rest of the menu is one link away.
   *
   * It stays honest in the other direction too, because a marked dish still has
   * to be available — yesterday's pick that has run out is not on show today.
   */
  const picks = cookingNow.filter((d) => d.featured);
  const hasPicks = show.recommended && picks.length > 0;

  // Nothing marked, or recommendations switched off: the page falls back to
  // whatever is cooking, in its usual order, and the heading says so instead.
  // Capped at eight either way, which is two full rows of the four-across grid.
  const preview = (hasPicks ? picks : cookingNow).slice(0, 8);

  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink">
      <SiteHeader />

      <Hero />

      {/* ---------------------------------------------------- best sellers */}
      {preview.length > 0 && (
        <section className="shell py-14">
          <div className="flex items-end justify-between gap-4 mb-4">
            <h2
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
              className="text-2xl md:text-3xl"
            >
              {hasPicks ? 'Best sellers' : 'Cooking today'}
            </h2>
            <Link to="/menu" className="text-sm text-diner-accent hover:underline whitespace-nowrap">
              See the whole menu
            </Link>
          </div>
          <div className={`grid gap-4 ${rowShape(preview.length)}`}>
            {preview.map((d) => (
              <Link
                key={d.id}
                to="/menu"
                className="rounded-3xl overflow-hidden bg-diner-card border border-diner-ink/10 hover:border-diner-ink/30 transition-colors"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <ImageWithFallback
                    src={d.image}
                    alt={d.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4 flex items-baseline justify-between gap-2">
                  <span
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
                    className="text-lg truncate"
                  >
                    {d.name}
                  </span>
                  <span className="tabular-nums opacity-70">₱{d.price}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ReviewShowcase />

      {/* ------------------------------------------------------ how it works */}
      {/* The heading sits in the row rather than above it. Three steps stretched
          across a laptop would be three enormous cards with two lines in each;
          giving the first column to the heading keeps the cards a readable size
          and uses the width instead of padding it out. */}
      <section className="shell pb-16">
        <div className="grid gap-6 lg:grid-cols-4 lg:gap-8">
          <div>
            <h2
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
              className="text-2xl md:text-3xl"
            >
              How ordering works
            </h2>

            <div className="mt-5 flex flex-wrap gap-2.5 text-sm">
              <Reassurance icon={<Utensils size={15} />} text="Freshly cooked every day" />
              <Reassurance icon={<ShieldCheck size={15} />} text="Prices confirmed at the counter" />
              <Reassurance icon={<Clock size={15} />} text="No queue to find out what is left" />
            </div>
          </div>

          <ol className="lg:col-span-3 grid gap-4 sm:grid-cols-3">
            {[
              ['Build your order', 'Browse what is actually cooking. Anything that has run out is already hidden.'],
              ['Get a ticket code', 'No account and no app. A short code lands on your phone.'],
              ['Show it at the counter', 'Pay cash or GCash. Your screen updates to Paid on its own.'],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
                <span className="text-xs tabular-nums tracking-[0.25em] text-diner-accent">
                  0{i + 1}
                </span>
                <h3
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
                  className="text-lg mt-2"
                >
                  {title}
                </h3>
                <p className="mt-1.5 text-sm opacity-70 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/**
 * How many columns a given number of dishes should sit in.
 *
 * A fixed four-across grid is only right when the count happens to divide by
 * four. The owner marks whatever they mark — five is a very natural number of
 * best sellers — and four columns left the fifth alone at the start of an empty
 * row, which reads as something missing rather than as a deliberate five.
 *
 * The strings are written out in full rather than built from the number,
 * because Tailwind finds classes by reading the source: a name assembled at run
 * time is a name it never sees and never generates.
 */
function rowShape(n: number): string {
  if (n <= 2) return 'sm:grid-cols-2 lg:grid-cols-3';
  if (n === 3) return 'sm:grid-cols-2 lg:grid-cols-3';
  if (n === 4) return 'sm:grid-cols-2 lg:grid-cols-4';
  if (n === 5) return 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';
  if (n === 6) return 'sm:grid-cols-2 lg:grid-cols-3';
  return 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

function Reassurance({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-diner-ink/15 opacity-75">
      <span className="text-diner-accent">{icon}</span>
      {text}
    </span>
  );
}
