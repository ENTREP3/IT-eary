import React, { useCallback, useEffect, useState } from 'react';
import { Check, Eye, Loader2, Quote, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBusinessStore, STOREFRONT_DEFAULTS, type Storefront } from '../../store/businessStore';

/**
 * What the storefront shows, decided by the owner.
 *
 * Grouped rather than listed flat, because the switches are not siblings: the
 * comments and the whole review showcase only mean anything while star ratings
 * are on, so they sit inside it and disappear when it is off. Six switches in a
 * row hid that relationship and left the owner wondering why turning one on
 * changed nothing.
 */

type BoolKey = 'ratings' | 'comments' | 'bestseller' | 'low_stock' | 'sold_out' | 'recommended';

type Pickable = {
  id: string;
  dish_name: string;
  rating: number;
  comment: string;
  featured: boolean;
};

const field =
  'h-9 rounded-lg border px-2.5 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] focus:border-[#e8a84a]/60';

export function StorefrontPanel() {
  const profile = useBusinessStore((s) => s.profile);
  const save = useBusinessStore((s) => s.save);

  const [draft, setDraft] = useState<Storefront>(profile.storefront ?? STOREFRONT_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reviews, setReviews] = useState<Pickable[] | null>(null);

  useEffect(() => setDraft(profile.storefront ?? STOREFRONT_DEFAULTS), [profile.storefront]);

  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, dish_id, rating, comment, featured')
      .order('created_at', { ascending: false });
    if (error) return setReviews([]);

    const { data: dishes } = await supabase.from('dishes').select('id, name');
    const names = new Map((dishes ?? []).map((d) => [d.id, d.name as string]));

    setReviews(
      (data ?? []).map((r) => ({
        id: r.id as string,
        dish_name: names.get(r.dish_id as string) ?? (r.dish_id as string),
        rating: r.rating as number,
        comment: (r.comment as string) ?? '',
        featured: Boolean(r.featured),
      })),
    );
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const commit = async (next: Storefront) => {
    const before = draft;
    setDraft(next);
    setBusy(true);
    setError(null);
    try {
      await save({ storefront: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      // Put it back. A control that stays where you left it after a failed save
      // is lying about what customers are seeing.
      setDraft(before);
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: BoolKey) => commit({ ...draft, [key]: !draft[key] });
  const set = <K extends keyof Storefront>(key: K, value: Storefront[K]) =>
    commit({ ...draft, [key]: value });

  const pick = async (r: Pickable) => {
    setError(null);
    const { data, error } = await supabase
      .from('reviews')
      .update({ featured: !r.featured })
      .eq('id', r.id)
      .select('id');

    // A blocked write returns success with no rows, so an empty result is the
    // failure that would otherwise look exactly like success.
    if (error || !data?.length) {
      setError(error?.message ?? 'That did not save. You may not have permission.');
      return;
    }
    setReviews((prev) => prev?.map((x) => (x.id === r.id ? { ...x, featured: !x.featured } : x)) ?? null);
  };

  const quotable = (reviews ?? []).filter(
    (r) =>
      r.rating >= draft.reviews_min_stars &&
      (draft.reviews_source === 'all' || r.featured),
  );

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
        Everything here changes what diners see. Changes apply the next time
        somebody loads the page.
      </p>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      {/* ------------------------------------------------------------ menu */}
      <Group title="On the menu">
        <Switch
          on={draft.bestseller}
          busy={busy}
          onChange={() => toggle('bestseller')}
          label="Bestseller mark"
          help={
            draft.bestseller
              ? 'Dishes you marked on the Menu screen wear a Bestseller badge. The Menu screen suggests which ones, from your sales.'
              : 'The badge is hidden. Your marked dishes still lead the front page.'
          }
        />
        <Switch
          on={draft.low_stock}
          busy={busy}
          onChange={() => toggle('low_stock')}
          label="Only a few left"
          help={
            draft.low_stock
              ? 'A dish running low says so, which tends to pull orders earlier in the day.'
              : 'Stock stays private until a dish actually runs out.'
          }
        />
        <Switch
          on={draft.sold_out}
          busy={busy}
          onChange={() => toggle('sold_out')}
          label="Sold-out dishes"
          help={
            draft.sold_out
              ? 'They stay on the menu, greyed, so diners know what to come back for.'
              : 'They disappear until you cook more. A quiet day looks fuller, but regulars cannot see what they missed.'
          }
        />
      </Group>

      {/* --------------------------------------------------------- reviews */}
      <Group title="Reviews">
        <Switch
          on={draft.ratings}
          busy={busy}
          onChange={() => toggle('ratings')}
          label="Star ratings"
          help={
            draft.ratings
              ? 'Each dish shows its average and how many people rated it.'
              : 'No ratings anywhere, and everything below is switched off with it.'
          }
        />

        {draft.ratings && (
          <div className="ml-[3.4rem] mt-1 space-y-3 border-l border-[#e8dfc8]/10 pl-4">
            <Switch
              on={draft.comments}
              busy={busy}
              onChange={() => toggle('comments')}
              label="What diners wrote"
              help={
                draft.comments
                  ? 'Comments appear under the dish and in the showcase below.'
                  : 'Stars only — the showcase keeps the scores and drops the words. Comments are still collected and still visible to you.'
              }
              compact
            />

            <div className="rounded-xl border border-[#e8dfc8]/10 p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Quote size={14} className="text-[#e8a84a]" />
                <span className="text-sm font-medium">The showcase</span>
              </div>
              <p className="text-[12px] opacity-55 mb-3 leading-relaxed">
                A band on the menu that quotes diners, a few at a time, then
                changes to the next few. With comments off it shows their star
                ratings instead.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] opacity-55">Which reviews</span>
                  <select
                    value={draft.reviews_source}
                    disabled={busy}
                    onChange={(e) => set('reviews_source', e.target.value as 'all' | 'picked')}
                    className={`${field} w-full mt-1`}
                  >
                    <option value="all">Any that meet the star rule</option>
                    <option value="picked">Only the ones I choose</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] opacity-55">Never quote below</span>
                  <select
                    value={draft.reviews_min_stars}
                    disabled={busy}
                    onChange={(e) => set('reviews_min_stars', Number(e.target.value))}
                    className={`${field} w-full mt-1`}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] opacity-55">Show at a time</span>
                  <select
                    value={draft.reviews_per_batch}
                    disabled={busy}
                    onChange={(e) => set('reviews_per_batch', Number(e.target.value))}
                    className={`${field} w-full mt-1`}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] opacity-55">Change every</span>
                  <select
                    value={draft.reviews_seconds}
                    disabled={busy}
                    onChange={(e) => set('reviews_seconds', Number(e.target.value))}
                    className={`${field} w-full mt-1`}
                  >
                    <option value={0}>Do not change</option>
                    {[5, 8, 12, 20, 30].map((n) => (
                      <option key={n} value={n}>{n} seconds</option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="text-[11px] opacity-45 mt-3">
                {quotable.length === 0
                  ? 'Nothing qualifies yet, so the band stays hidden rather than showing an empty space.'
                  : `${quotable.length} review${quotable.length === 1 ? '' : 's'} qualify, shown ${draft.reviews_per_batch} at a time` +
                    (draft.reviews_seconds ? `, changing every ${draft.reviews_seconds} seconds.` : ', without changing.')}
              </p>
            </div>

            {/* the picker, only when it can do anything */}
            {draft.reviews_source === 'picked' && (
              <div className="rounded-xl border border-[#e8dfc8]/10 p-3.5">
                <div className="text-sm font-medium mb-1">Choose what to quote</div>
                <p className="text-[12px] opacity-55 mb-3 leading-relaxed">
                  Every review still counts towards the dish average. This only
                  decides which are quoted on the front of the shop.
                </p>

                {reviews === null && <p className="text-[12px] opacity-45">Loading…</p>}
                {reviews?.length === 0 && (
                  <p className="text-[12px] opacity-45">
                    No reviews yet. They appear here as diners leave them.
                  </p>
                )}

                <div className="space-y-1.5 max-h-64 overflow-auto">
                  {reviews?.map((r) => {
                    const belowBar = r.rating < draft.reviews_min_stars;
                    return (
                      <button
                        key={r.id}
                        onClick={() => pick(r)}
                        className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                          r.featured
                            ? 'border-[#e8a84a]/50 bg-[#e8a84a]/10'
                            : 'border-[#e8dfc8]/10 hover:border-[#e8dfc8]/25'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                size={11}
                                className={n <= r.rating ? 'fill-[#e8a84a] text-[#e8a84a]' : 'text-[#e8dfc8]/25'}
                              />
                            ))}
                          </span>
                          <span className="text-[12px] opacity-70">{r.dish_name}</span>
                          {r.featured && <span className="text-[10px] text-[#e8a84a] ml-auto">Quoted</span>}
                          {belowBar && r.featured && (
                            <span className="text-[10px] text-[#e87a5c]">below your star rule</span>
                          )}
                        </div>
                        {r.comment && (
                          <p className="text-[12px] opacity-60 mt-1 line-clamp-2">{r.comment}</p>
                        )}
                        {!r.comment && (
                          <p className="text-[11px] opacity-35 mt-1">Stars only, no words written</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Group>

      {/* ------------------------------------------------------ front page */}
      <Group title="On the front page">
        <div className="rounded-xl border border-[#e8dfc8]/10 p-3.5">
          <div className="text-sm font-medium mb-1">The big picture behind the headline</div>
          <p className="text-[12px] opacity-55 mb-3 leading-relaxed">
            The dishes you have featured take turns filling the top of the front
            page. Only ones with a photograph appear, and if nothing is featured
            it falls back to whatever is cooking.
          </p>
          <label className="block max-w-[220px]">
            <span className="text-[11px] opacity-55">Change the picture every</span>
            <select
              value={draft.hero_seconds}
              disabled={busy}
              onChange={(e) => set('hero_seconds', Number(e.target.value))}
              className={`${field} w-full mt-1`}
            >
              <option value={0}>Do not change</option>
              {[5, 7, 10, 15, 25].map((n) => (
                <option key={n} value={n}>{n} seconds</option>
              ))}
            </select>
          </label>
        </div>

        <Switch
          on={draft.recommended}
          busy={busy}
          onChange={() => toggle('recommended')}
          label="What we recommend"
          help={
            draft.recommended
              ? 'Dishes you marked a bestseller lead the front page, above the rest.'
              : 'The front page shows whatever is cooking, in its usual order.'
          }
        />
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="text-[10px] tracking-[0.22em] uppercase opacity-45 mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Switch({
  on,
  busy,
  onChange,
  label,
  help,
  compact,
}: {
  on: boolean;
  busy: boolean;
  onChange: () => void;
  label: string;
  help: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 ${
        compact ? '' : 'rounded-xl border border-[#e8dfc8]/10 p-3.5'
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onChange}
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
        <div className="text-sm font-medium">{label}</div>
        <p className="text-[12px] opacity-55 mt-0.5 leading-relaxed">{help}</p>
      </div>
    </div>
  );
}
