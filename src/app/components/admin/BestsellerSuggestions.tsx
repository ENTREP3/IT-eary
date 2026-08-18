import React, { useMemo, useState } from 'react';
import { Flame, Loader2, Star, StarOff, X } from 'lucide-react';
import { useKarinderyaStore } from '../../store/karinderyaStore';
import { useBusinessStore, STOREFRONT_DEFAULTS } from '../../store/businessStore';

/**
 * What the sales say, offered as a question rather than acted on.
 *
 * The bestseller badge used to appear by itself: whichever dish led its
 * category wore it, and nobody at the shop was ever asked. That is the shop
 * making a claim about its own food on the strength of a sum, and it had a
 * second fault — a dish with no sales can never top a list, so a new dish could
 * never be promoted however good it was.
 *
 * So the figures stay, but they stop being the decision. They come here, as a
 * suggestion the owner accepts or declines, and the badge only ever says what
 * the owner agreed to say.
 *
 * The second half asks the opposite question, and has to be careful about it.
 * The obvious way to suggest *unmarking* would be to flag a marked dish that is
 * not selling — which is exactly the new dish the owner is deliberately pushing,
 * so the system would be arguing with the person it is meant to be advising.
 *
 * So the second half does not ask about a quiet dish at all. It
 * asks only when there is a concrete alternative: something the owner has NOT
 * marked is outselling their pick in the same category by a wide margin. That
 * is a fact worth knowing rather than an opinion about the food, and it names
 * the dish that prompted it so the owner can judge for themselves.
 */

/** Sales must climb by half again before a declined dish is raised a second time. */
const ASK_AGAIN_AT = 1.5;

/**
 * How far an unmarked dish has to be ahead before the marked one is questioned.
 *
 * Twice is deliberately a wide gap. A marked dish merely being second is
 * nothing — the owner may be pushing it precisely because it needs the help.
 * Being outsold two to one by something they passed over is a different claim.
 */
const CLEARLY_AHEAD = 2;

/** Dismissed un-mark suggestions are stored under this prefix, alongside the
 *  marks, so both halves of the panel share one small object. */
const UNMARK = 'unmark:';

export function BestsellerSuggestions() {
  const dishes = useKarinderyaStore((s) => s.dishes);
  const updateDish = useKarinderyaStore((s) => s.updateDish);
  const profile = useBusinessStore((s) => s.profile);
  const save = useBusinessStore((s) => s.save);

  const show = profile.storefront ?? STOREFRONT_DEFAULTS;
  const dismissed = show.bestseller_dismissed ?? {};

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The leader of each category, where that leader is not already marked.
   *
   * Ranked within the category, not across the menu: drinks outsell every main
   * dish, so a single top-of-the-shop suggestion would only ever be a drink and
   * the owner would never be told anything about their ulam.
   */
  const suggestions = useMemo(() => {
    const top = new Map<string, { id: string; name: string; category: string; sold: number; runnerUp: number }>();

    for (const d of dishes) {
      if (!d.available || d.soldToday <= 0) continue;
      const held = top.get(d.category);
      if (!held) {
        top.set(d.category, { id: d.id, name: d.name, category: d.category, sold: d.soldToday, runnerUp: 0 });
      } else if (d.soldToday > held.sold) {
        top.set(d.category, { ...held, id: d.id, name: d.name, sold: d.soldToday, runnerUp: held.sold });
      } else if (d.soldToday > held.runnerUp) {
        held.runnerUp = d.soldToday;
      }
    }

    return [...top.values()]
      .filter((s) => {
        const dish = dishes.find((d) => d.id === s.id);
        if (!dish || dish.featured) return false;
        const refusedAt = dismissed[s.id];
        if (refusedAt === undefined) return true;
        return s.sold >= refusedAt * ASK_AGAIN_AT;
      })
      .sort((a, b) => b.sold - a.sold);
  }, [dishes, dismissed]);

  /**
   * Marked dishes that something unmarked is clearly outselling.
   *
   * The rival has to be unmarked on purpose. Two marked dishes in one category
   * is the owner promoting a range, not a mistake to correct.
   */
  const demotions = useMemo(() => {
    const out: { id: string; name: string; sold: number; rival: string; rivalSold: number }[] = [];

    for (const d of dishes) {
      if (!d.featured || !d.available) continue;

      let rival: typeof d | null = null;
      for (const other of dishes) {
        if (other.featured || !other.available || other.category !== d.category) continue;
        if (other.soldToday < d.soldToday * CLEARLY_AHEAD) continue;
        if (!rival || other.soldToday > rival.soldToday) rival = other;
      }
      if (!rival) continue;

      const refusedAt = dismissed[UNMARK + d.id];
      if (refusedAt !== undefined && rival.soldToday < refusedAt * ASK_AGAIN_AT) continue;

      out.push({
        id: d.id,
        name: d.name,
        sold: d.soldToday,
        rival: rival.name,
        rivalSold: rival.soldToday,
      });
    }

    return out.sort((a, b) => b.rivalSold - a.rivalSold);
  }, [dishes, dismissed]);

  if (suggestions.length === 0 && demotions.length === 0) return null;

  const accept = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await updateDish(id, { featured: true });
      // Clear any old refusal, so unmarking it later starts the question fresh
      // rather than silently inheriting a stale threshold.
      if (dismissed[id] !== undefined) {
        const rest = { ...dismissed };
        delete rest[id];
        await save({ storefront: { ...show, bestseller_dismissed: rest } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const decline = async (key: string, sold: number) => {
    setBusy(key.startsWith(UNMARK) ? key.slice(UNMARK.length) : key);
    setError(null);
    try {
      await save({ storefront: { ...show, bestseller_dismissed: { ...dismissed, [key]: sold } } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const unmark = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await updateDish(id, { featured: false });
      // Both refusals go, so the dish starts either question fresh rather than
      // inheriting a threshold from the last time round.
      const rest = { ...dismissed };
      delete rest[id];
      delete rest[UNMARK + id];
      await save({ storefront: { ...show, bestseller_dismissed: rest } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[#e8a84a]/25 bg-[#e8a84a]/[0.06] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Flame size={16} className="text-[#e8a84a]" />
        <h3 className="text-sm font-medium">What the sales say</h3>
      </div>
      <p className="text-[12px] opacity-60 mb-4 max-w-xl leading-relaxed">
        Nothing here changes until you say so.
      </p>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      {suggestions.length > 0 && (
        <h4 className="text-[11px] tracking-[0.2em] uppercase opacity-50 mb-2">
          Selling well — mark them?
        </h4>
      )}

      <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="rounded-xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-3.5 flex flex-col gap-3"
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>{s.name}</div>
              <p className="text-xs opacity-55 mt-1 leading-relaxed">
                {s.sold} sold — the most in {s.category}
                {s.runnerUp > 0 && `, ahead of the next by ${s.sold - s.runnerUp}`}.
              </p>
            </div>

            <div className="flex items-center gap-2 mt-auto">
              <button
                type="button"
                disabled={busy === s.id}
                onClick={() => accept(s.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-xs font-medium disabled:opacity-50"
              >
                {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
                Mark as bestseller
              </button>
              <button
                type="button"
                disabled={busy === s.id}
                onClick={() => decline(s.id, s.sold)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e8dfc8]/15 text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
                title="Asked again only if it sells notably more"
              >
                <X size={13} /> Not now
              </button>
            </div>
          </li>
        ))}
      </ul>

      {demotions.length > 0 && (
        <>
          <h4 className="text-[11px] tracking-[0.2em] uppercase opacity-50 mb-2 mt-5">
            Being outsold — still a bestseller?
          </h4>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {demotions.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-3.5 flex flex-col gap-3"
              >
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>{s.name}</div>
                  <p className="text-xs opacity-55 mt-1 leading-relaxed">
                    {s.sold} sold, while {s.rival} has sold {s.rivalSold} and is not
                    marked. Keep it if you are pushing it on purpose.
                  </p>
                </div>

                <div className="flex items-center gap-2 mt-auto">
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => unmark(s.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e8dfc8]/25 text-xs hover:border-[#e8dfc8]/50 disabled:opacity-40"
                  >
                    {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <StarOff size={13} />}
                    Unmark it
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => decline(UNMARK + s.id, s.rivalSold)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e8dfc8]/15 text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
                    title="Asked again only if the gap widens"
                  >
                    <X size={13} /> Keep it
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
