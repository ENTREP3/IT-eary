import React from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Clock, MapPin, Phone, ShieldCheck, Utensils } from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { ImageWithFallback } from '../sigma/ImageWithFallback';
import { useBusinessStore, addressOf } from '../../store/businessStore';
import { SiteHeader, SiteFooter, OpenPill, Tagline } from './SiteChrome';

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

  /**
   * The owner's own picks come first, then whatever else is cooking.
   *
   * Left to itself the front page could only ever promote what already sold
   * well, so a new dish was invisible by definition however good it was. The
   * owner knows things the figures do not: that today's kaldereta came out
   * especially well, or that the kambing needs to move. This is where they say
   * so, and it stays honest because a featured dish still has to be available.
   */
  const show = biz.storefront;

  // With recommendations switched off the front page simply shows what is
  // cooking, in its usual order, and the heading says so.
  const preview = (show.recommended
    ? [...cookingNow.filter((d) => d.featured), ...cookingNow.filter((d) => !d.featured)]
    : cookingNow
  ).slice(0, 3);

  const hasPicks = show.recommended && cookingNow.some((d) => d.featured);

  return (
    <div className="min-h-screen bg-diner-ground text-diner-ink">
      <SiteHeader />

      {/* ------------------------------------------------------------ hero */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pt-12 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <OpenPill />
          <Tagline className="mt-5 text-5xl md:text-7xl" />
          <p className="mt-5 max-w-xl opacity-75 leading-relaxed">{biz.blurb}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/menu"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-diner-ink text-diner-ground hover:opacity-90"
            >
              See what is cooking today
              <ArrowRight size={17} />
            </Link>
            {loaded && (
              <span className="text-sm opacity-60">
                {cookingNow.length} {cookingNow.length === 1 ? 'dish' : 'dishes'} available right now
              </span>
            )}
          </div>
        </motion.div>
      </section>

      {/* ------------------------------------------------ the three answers */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-12">
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoCard
            icon={<Clock size={18} />}
            title="Opening hours"
            lines={biz.hours.map((h) => `${h.days}: ${h.opens} to ${h.closes}`)}
          />
          <InfoCard icon={<MapPin size={18} />} title="Where to find us" lines={[addressOf(biz)]} />
          <InfoCard
            icon={<Phone size={18} />}
            title="Contact"
            lines={[biz.phone, 'Cash and GCash accepted']}
          />
        </div>
      </section>

      {/* ------------------------------------------------------ menu preview */}
      {preview.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 md:px-8 pb-14">
          <div className="flex items-end justify-between gap-4 mb-4">
            <h2
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
              className="text-2xl md:text-3xl"
            >
              {hasPicks ? 'What we recommend today' : 'Cooking today'}
            </h2>
            <Link to="/menu" className="text-sm text-diner-accent hover:underline whitespace-nowrap">
              See the whole menu
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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

      {/* ------------------------------------------------------ how it works */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 pb-16">
        <h2
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.02em' }}
          className="text-2xl md:text-3xl mb-5"
        >
          How ordering works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
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

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Reassurance icon={<Utensils size={15} />} text="Freshly cooked every day" />
          <Reassurance icon={<ShieldCheck size={15} />} text="Prices confirmed at the counter" />
          <Reassurance icon={<Clock size={15} />} text="No queue to find out what is left" />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function InfoCard({
  icon,
  title,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
      <div className="flex items-center gap-2 text-diner-accent">
        {icon}
        <h2 className="text-[11px] tracking-[0.22em] uppercase">{title}</h2>
      </div>
      <div className="mt-2.5 space-y-1 text-sm opacity-80 leading-relaxed">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}

function Reassurance({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-diner-ink/15 opacity-75">
      <span className="text-diner-accent">{icon}</span>
      {text}
    </span>
  );
}
