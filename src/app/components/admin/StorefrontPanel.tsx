import React, { useEffect, useState } from 'react';
import { Check, Eye, Loader2 } from 'lucide-react';
import { useBusinessStore, STOREFRONT_DEFAULTS, type Storefront } from '../../store/businessStore';

/**
 * What the storefront shows, decided by the owner.
 *
 * Ratings, the bestseller mark, the low-stock warning, sold-out dishes and the
 * recommended row were all hardcoded on. Every one is a judgement about how the
 * shop presents itself, and none of them was the owner's to make.
 *
 * The choices are not cosmetic. Showing sold-out dishes is honest and tells a
 * diner what to come back for; hiding them makes a thin day look fuller. Ratings
 * are confidence when the food is well reviewed and a liability in the week
 * after a bad one. A shop that has just opened may want none of it until there
 * is something worth showing.
 */

type Option = {
  key: keyof Storefront;
  label: string;
  on: string;
  off: string;
};

const OPTIONS: Option[] = [
  {
    key: 'ratings',
    label: 'Star ratings',
    on: 'Each dish shows its average rating and how many people left one.',
    off: 'No ratings anywhere on the menu, even where they exist.',
  },
  {
    key: 'comments',
    label: 'What diners wrote',
    on: 'The comments left with a rating are shown under the dish.',
    off: 'Stars only. Comments are still collected and still visible to you.',
  },
  {
    key: 'bestseller',
    label: 'Bestseller mark',
    on: "The best-selling dish in each category is marked, worked out from today's sales.",
    off: 'No dish is singled out for selling well.',
  },
  {
    key: 'low_stock',
    label: 'Only a few left',
    on: 'A dish running low says so, which tends to pull orders earlier in the day.',
    off: 'Stock stays private until a dish actually runs out.',
  },
  {
    key: 'sold_out',
    label: 'Sold-out dishes',
    on: 'Dishes that have run out stay on the menu, greyed, so diners know to come back for them.',
    off: 'They disappear until you cook more. A quiet day looks fuller, but regulars cannot see what they missed.',
  },
  {
    key: 'recommended',
    label: 'What we recommend',
    on: 'Dishes you have featured lead the front page, above the rest.',
    off: 'The front page shows whatever is cooking, in its usual order.',
  },
];

export function StorefrontPanel() {
  const profile = useBusinessStore((s) => s.profile);
  const save = useBusinessStore((s) => s.save);

  const [draft, setDraft] = useState<Storefront>(profile.storefront ?? STOREFRONT_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The store starts from a cached profile and refreshes a moment later, so the
  // real settings can arrive after this has already rendered.
  useEffect(() => {
    setDraft(profile.storefront ?? STOREFRONT_DEFAULTS);
  }, [profile.storefront]);

  const toggle = async (key: keyof Storefront) => {
    const next = { ...draft, [key]: !draft[key] };
    setDraft(next);
    setBusy(true);
    setError(null);
    try {
      await save({ storefront: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      // Put the switch back where it was. A toggle that stays flipped after a
      // failed save is a lie about what customers are seeing.
      setDraft(draft);
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const hidden = OPTIONS.filter((o) => !draft[o.key]).length;

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Eye size={16} className="text-[#e8a84a]" />
        <h3 className="text-sm font-medium">What the storefront shows</h3>
        {busy && <Loader2 size={13} className="animate-spin opacity-60" />}
        {saved && !busy && (
          <span className="text-[11px] text-[#8cc07a] inline-flex items-center gap-1">
            <Check size={12} /> Saved
          </span>
        )}
      </div>
      <p className="text-[12px] opacity-55 mb-4 max-w-xl leading-relaxed">
        These change what diners see on the menu and the front page. Everything is
        on by default. Changes take effect the next time a diner loads the page.
      </p>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const on = draft[o.key];
          return (
            <div
              key={o.key}
              className="rounded-xl border border-[#e8dfc8]/10 p-3.5 flex items-start gap-3"
            >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={o.label}
                onClick={() => toggle(o.key)}
                disabled={busy}
                className={`relative w-11 h-6 rounded-full shrink-0 mt-0.5 transition-colors disabled:opacity-50 ${
                  on ? 'bg-[#8cc07a]' : 'bg-[#e8dfc8]/15'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                    on ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-medium">{o.label}</div>
                <p className="text-[12px] opacity-55 mt-0.5 leading-relaxed">
                  {on ? o.on : o.off}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <p className="text-[12px] opacity-45 mt-3">
          {hidden === 1 ? 'One thing is' : `${hidden} things are`} switched off. Diners
          will not see {hidden === 1 ? 'it' : 'them'} even where the information exists.
        </p>
      )}
    </section>
  );
}
