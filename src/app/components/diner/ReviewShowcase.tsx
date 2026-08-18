import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBusinessStore } from '../../store/businessStore';

/**
 * What diners said, a few at a time, cycling.
 *
 * Food is bought on trust and a first-time visitor has nothing else to go on.
 * A wall of every review is unreadable and a single static quote looks planted;
 * a small group that changes reads like a board of testimonials and gives every
 * good review a turn.
 *
 * The owner controls all of it on the Shop screen: which reviews qualify, the
 * star floor, how many are on screen, and how often they change.
 */

type Quote = {
  id: string;
  dish: string;
  rating: number;
  comment: string;
  author: string | null;
};

/**
 * Four columns, always, whatever the batch size is.
 *
 * Not "as many columns as there are quotes": the card is a fixed thing on the
 * page, and it should not grow to double width because the owner chose to show
 * two at a time, or because the last batch happened to be short. One quote, two
 * or four, each one is the same card in the same place — the band keeps its
 * shape and only the number of them in it changes.
 */
const BAND_COLUMNS = 'sm:grid-cols-2 lg:grid-cols-4';

export function ReviewShowcase() {
  const show = useBusinessStore((s) => s.profile.storefront);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!show.ratings) return;

    let cancelled = false;
    (async () => {
      let q = supabase
        .from('reviews')
        .select('id, dish_id, rating, comment, author_name, featured')
        .gte('rating', show.reviews_min_stars)
        .order('created_at', { ascending: false })
        .limit(40);

      // A quote with no words is not a quote, so while comments are on the
      // wordless ratings are left out. With comments off the band is nothing
      // but scores, and those same ratings are exactly what it has to show.
      if (show.comments) q = q.neq('comment', '');

      if (show.reviews_source === 'picked') q = q.eq('featured', true);

      const { data, error } = await q;
      if (error || cancelled) return;

      const { data: dishes } = await supabase.from('dishes').select('id, name');
      const names = new Map((dishes ?? []).map((d) => [d.id, d.name as string]));

      if (cancelled) return;
      setQuotes(
        (data ?? []).map((r) => ({
          id: r.id as string,
          dish: names.get(r.dish_id as string) ?? '',
          rating: r.rating as number,
          comment: r.comment as string,
          author: (r.author_name as string) ?? null,
        })),
      );
      setPage(0);
    })();

    return () => {
      cancelled = true;
    };
  }, [show.ratings, show.comments, show.reviews_source, show.reviews_min_stars]);

  const size = Math.max(1, show.reviews_per_batch);
  const pages = Math.max(1, Math.ceil(quotes.length / size));

  useEffect(() => {
    // No timer when there is nothing to move to, or when the owner asked it to
    // hold still. An interval that only ever redraws the same batch is wasted
    // work on a phone.
    if (!show.reviews_seconds || pages < 2) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), show.reviews_seconds * 1000);
    return () => clearInterval(id);
  }, [show.reviews_seconds, pages]);

  const batch = useMemo(
    () => quotes.slice(page * size, page * size + size),
    [quotes, page, size],
  );

  // Hidden entirely rather than shown empty: a testimonial band with nothing in
  // it says the food has no admirers, which is worse than saying nothing.
  //
  // Switching comments off used to hide the band too, which contradicted what
  // that switch says it does — "stars only" — and took the ratings off the page
  // along with the words. It now keeps the scores and drops the sentences.
  if (!show.ratings || batch.length === 0) return null;

  return (
    <section className="shell py-8 border-t border-diner-ink/10">
      <h2 className="text-[11px] tracking-[0.25em] uppercase opacity-55 mb-4">
        {show.comments ? 'What diners said' : 'How diners rated us'}
      </h2>

      <div className={`grid gap-3 ${BAND_COLUMNS}`}>
        <AnimatePresence mode="wait">
          {batch.map((q) => (
            <motion.figure
              key={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45 }}
              className="rounded-2xl bg-diner-card border border-diner-ink/10 p-4"
            >
              <div className="flex items-center gap-1.5 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={13}
                    className={n <= q.rating ? 'fill-diner-accent text-diner-accent' : 'text-diner-ink/20'}
                  />
                ))}
                <span className="text-xs opacity-55 ml-1">{q.dish}</span>
              </div>
              {show.comments && q.comment && (
                <blockquote className="text-sm leading-relaxed">{q.comment}</blockquote>
              )}
              {q.author && (
                <figcaption className="text-xs opacity-50 mt-2">{q.author}</figcaption>
              )}
            </motion.figure>
          ))}
        </AnimatePresence>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-1.5 mt-4" role="tablist" aria-label="More reviews">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === page}
              aria-label={`Reviews ${i + 1} of ${pages}`}
              onClick={() => setPage(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === page ? 'w-6 bg-diner-accent' : 'w-1.5 bg-diner-ink/20 hover:bg-diner-ink/40'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
