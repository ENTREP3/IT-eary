import React, { useMemo, useState } from 'react';
import { Flame, Loader2, Star, X } from 'lucide-react';
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
 * There is no matching suggestion to *unmark* a dish. The obvious candidate
 * would be a marked dish that is not selling, which is exactly the new dish the
 * owner is deliberately pushing — the system would be arguing with the person
 * it is supposed to be advising.
 */

/** Sales must climb by half again before a declined dish is raised a second time. */
const ASK_AGAIN_AT = 1.5;

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

  if (suggestions.length === 0) return null;

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

  const decline = async (id: string, sold: number) => {
    setBusy(id);
    setError(null);
    try {
      await save({ storefront: { ...show, bestseller_dismissed: { ...dismissed, [id]: sold } } });
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
        <h3 className="text-sm font-medium">Selling well — mark them?</h3>
      </div>
      <p className="text-[12px] opacity-60 mb-4 max-w-xl leading-relaxed">
        These are leading their category. Nothing is shown to diners until you
        say so, and you can unmark any dish later from the list below.
      </p>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
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
    </section>
  );
}
