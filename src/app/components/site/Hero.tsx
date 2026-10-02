import React, { useEffect, useMemo, useRef, useState } from 'react';
import { displayPhoto } from '../../lib/photos';
import { Link } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { useBusinessStore } from '../../store/businessStore';
import { ImageWithFallback } from '../sigma/ImageWithFallback';
import { OpenPill } from './SiteChrome';

/**
 * The front page opens on the food, not on a paragraph.
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

  /**
   * Set once somebody swipes or taps a dot.
   *
   * They have taken over, and a slideshow that carries on pulling away under
   * their thumb is worse than one that never moved.
   */
  const [held, setHeld] = useState(false);

  useEffect(() => {
    // No timer for a single slide, none for somebody who has asked their
    // system to stop moving things, and none once they are driving.
    if (held || stillness || !show.hero_seconds || slides.length < 2) return;
    const id = setInterval(
      () => setI((n) => (n + 1) % slides.length),
      show.hero_seconds * 1000,
    );
    return () => clearInterval(id);
  }, [held, stillness, show.hero_seconds, slides.length]);

  /** Moves the hero by hand, wrapping at either end. */
  const step = (by: number) => {
    if (slides.length < 2) return;
    setHeld(true);
    setI((n) => (n + by + slides.length) % slides.length);
  };

  // Where a touch started, so a flick can be told from a tap or a scroll.
  const touch = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const from = touch.current;
    touch.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    // Horizontal, and far enough to be deliberate. Anything more vertical than
    // sideways is the diner scrolling the page, not changing the picture.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  };

  const current = slides[i % Math.max(1, slides.length)];

  return (
    <section
      className="relative isolate min-h-[78vh] flex items-end overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
                src={displayPhoto(current.image)}
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
                      onClick={() => { setHeld(true); setI(n); }}
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
