import React, { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useReviewStore } from '../../store/reviewStore';
import { saveRating } from '../../lib/localPrefs';
import { useMyRating, refreshMyRatings } from '../../lib/myRatings';
import { humanError } from '../../lib/errors';

/**
 * Rating the dishes on an order, from the order.
 *
 * Rating already existed, on the dish cards in the menu, behind a check that
 * this browser had ordered the dish. Which meant somebody looking at their own
 * order history — the one screen in the whole site that is a list of meals
 * they have definitely eaten — had no way to rate any of them, and had to go
 * back to the menu, find the dish among two dozen others, and hope the button
 * was there.
 *
 * This is the same `leave_review` underneath. The difference is that here the
 * ticket is not something to look up: it is the card the diner is already
 * reading, so the question "may this person rate this dish" never has to be
 * asked.
 *
 * Shown only on a collected order. Rating food before it is handed over is
 * rating the wait, and the database refuses it anyway.
 */

type Item = { id?: string; name: string; qty: number };

export function RateFromOrder({
  ticketCode,
  items,
}: {
  ticketCode: string;
  items: Item[];
}) {
  const rateable = items.filter((i) => i.id);
  if (rateable.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-diner-ink/10">
      <p className="text-[10px] uppercase tracking-wider opacity-45 mb-2">
        How was it?
      </p>
      <div className="space-y-2">
        {rateable.map((item) => (
          <DishRow key={item.id} ticketCode={ticketCode} item={item} />
        ))}
      </div>
    </div>
  );
}

function DishRow({ ticketCode, item }: { ticketCode: string; item: Item }) {
  const dishId = item.id!;
  const post = useReviewStore((s) => s.submit);

  const existing = useMyRating(dishId);
  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? '');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(existing));
  const [error, setError] = useState<string | null>(null);

  /*
   * Follow the rating once it arrives.
   *
   * useState only reads its argument on the first render, and the account
   * copy is fetched over the network — so a rating left on another device
   * lands after this has already initialised to zero stars, and without this
   * would never be shown. Skipped while the sheet is open, so it cannot
   * overwrite what somebody is in the middle of typing.
   */
  useEffect(() => {
    if (!existing || open) return;
    setStars(existing.stars);
    setComment(existing.comment);
    setDone(true);
  }, [existing?.stars, existing?.comment, open]);

  const send = async (rating: number, words: string) => {
    setBusy(true);
    setError(null);
    try {
      await post({ ticketCode, dishId, rating, comment: words.trim() });
      // Remembered on the device too, so the stars stay filled in on a revisit
      // without asking the server what this person said.
      saveRating({
        dishId,
        stars: rating,
        comment: words.trim(),
        at: new Date().toISOString(),
        ticket: ticketCode,
      });
      // So the shared copy is not a step behind what was just saved.
      refreshMyRatings();
      setDone(true);
      setOpen(false);
    } catch (e) {
      setError(humanError(e, 'Could not post that rating.'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The stars send immediately; the words are optional and come after.
   *
   * Asking for a comment before accepting the rating loses most of them — the
   * rating is one tap and the sentence is a decision. Taking the tap first
   * means a diner who says nothing else has still said something.
   */
  const pick = (n: number) => {
    setStars(n);
    setOpen(true);
    void send(n, comment);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm truncate">{item.name}</span>

        <span className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => pick(n)}
              aria-label={`${n} star${n > 1 ? 's' : ''} for ${item.name}`}
              className="p-0.5 disabled:opacity-50"
            >
              <Star
                size={17}
                className={n <= stars ? 'text-diner-accent' : 'opacity-25'}
                fill={n <= stars ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </span>

        {busy && <Loader2 size={13} className="animate-spin opacity-50" />}
      </div>

      {done && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 text-xs text-diner-accent hover:underline"
        >
          {comment ? 'Edit what you said' : 'Add a comment'}
        </button>
      )}

      {open && (
        <div className="mt-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Anything you want to say about it? (optional)"
            className="w-full rounded-xl border border-diner-ink/15 bg-diner-ground px-3 py-2 text-sm outline-none focus:border-diner-ink/40 resize-none"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy || !stars}
              onClick={() => send(stars, comment)}
              className="h-8 px-3 rounded-full bg-diner-ink text-diner-ground text-xs disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 px-3 text-xs opacity-60 hover:opacity-100"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-diner-accent">{error}</p>}
      {done && !open && !error && (
        <p className="mt-0.5 text-xs opacity-45">Thank you — this is on the dish now.</p>
      )}
    </div>
  );
}
