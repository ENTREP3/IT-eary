import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { useBusinessStore } from '../../store/businessStore';
import { ImageWithFallback } from '../sigma/ImageWithFallback';
import { OpenPill } from './SiteChrome';

/**
 * The front page opens on the food, not on a paragraph.
 *
 * The dishes the owner featured take turns filling the screen behind the
 * headline. That is the only thing on this page that can make somebody hungry,
 * and it was previously three small thumbnails below the fold while the top of
 * the page repeated the opening hours and address that already sit in the footer.
 *
 * Everything on top of the photograph has to stay readable over a photograph
 * nobody has vetted, which is what the scrim below is for: the owner will upload
 * their own pictures, some bright, some dark, and the headline cannot depend on
 * any of them.
 */
export function Hero() {
  const biz = useBusinessStore((s) => s.profile);
  const show = biz.storefront;
  const dishes = useKarinderyaStore((s) => s.dishes);
  const loaded = useKarinderyaStore((s) => s.loaded);
  const stillness = useReducedMotion();

  const cooking = useMemo(() => dishes.filter((d) => d.available), [dishes]);

  /**
   * The owner's picks, and only ones that actually have a photograph. A
   * featured dish with no image would rotate to a blank screen, which looks
   * broken rather than minimal.
   */
  const slides = useMemo(() => {
    const featured = cooking.filter((d) => d.featured && d.image);
    if (featured.length) return featured;
    // Nothing picked yet: fall back to whatever is cooking and has a photo, so
    // a shop that has never opened the admin screen still gets a hero.
    return cooking.filter((d) => d.image).slice(0, 5);
  }, [cooking]);

  const [i, setI] = useState(0);

  useEffect(() => {
    // No timer for a single slide, and none for somebody who has asked their
    // system to stop moving things.
    if (stillness || !show.hero_seconds || slides.length < 2) return;
    const id = setInterval(
      () => setI((n) => (n + 1) % slides.length),
      show.hero_seconds * 1000,
    );
    return () => clearInterval(id);
  }, [stillness, show.hero_seconds, slides.length]);

  const current = slides[i % Math.max(1, slides.length)];

  return (
    <section className="relative isolate min-h-[78vh] flex items-end overflow-hidden">
      {/* the photograph */}
      <div className="absolute inset-0 -z-20 bg-diner-ink">
        <AnimatePresence mode="sync">
          {current && (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 1.1 }, scale: { duration: 8, ease: 'linear' } }}
              className="absolute inset-0"
            >
              <ImageWithFallback
                src={current.image}
                alt=""
                className="w-full h-full object-cover"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The scrim. Two layers rather than one flat wash: a vertical gradient so
          the words at the bottom sit on near-black, and a light overall tint so
          a very bright photograph cannot wash out the pill at the top. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />

      <div className="relative shell pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white"
        >
          <div className="[&_span]:!text-white/85 [&_span]:!border-white/35">
            <OpenPill />
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              letterSpacing: '-0.03em',
              lineHeight: 0.95,
            }}
            className="mt-5 text-5xl md:text-7xl drop-shadow-sm"
          >
            {(() => {
              const words = biz.tagline.trim().split(/\s+/);
              const last = words.pop() ?? '';
              return (
                <>
                  {words.join(' ')}
                  {words.length ? ' ' : ''}
                  <em className="text-diner-accent not-italic md:italic">{last}</em>
                </>
              );
            })()}
          </h1>

          <p className="mt-5 max-w-xl text-white/80 leading-relaxed">{biz.blurb}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/menu"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white text-diner-ink font-medium hover:bg-white/90 transition-colors"
            >
              See what is cooking today
              <ArrowRight size={17} />
            </Link>
            {loaded && (
              <span className="text-sm text-white/70">
                {cooking.length} {cooking.length === 1 ? 'dish' : 'dishes'} available right now
              </span>
            )}
          </div>

          {/* Which dish is behind the words. Without this the photograph is
              decoration; with it, it is the shop showing you something. */}
          {current && (
            <div className="mt-8 flex items-center gap-3">
              <AnimatePresence mode="wait">
                <motion.span
                  key={current.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-xs tracking-[0.2em] uppercase text-white/60"
                >
                  {current.name} · ₱{current.price}
                </motion.span>
              </AnimatePresence>

              {slides.length > 1 && (
                <div className="flex items-center gap-1.5 ml-1">
                  {slides.map((d, n) => (
                    <button
                      key={d.id}
                      onClick={() => setI(n)}
                      aria-label={`Show ${d.name}`}
                      aria-current={n === i}
                      className={`h-1 rounded-full transition-all ${
                        n === i ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
