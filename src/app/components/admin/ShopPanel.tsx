import React, { useEffect, useState } from 'react';
import { Check, Loader2, Plus, Star, Trash2, UserMinus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBusinessStore, type Hours } from '../../store/businessStore';
import { AnnouncementSection } from './AnnouncementSection';
import { AppPosterSection } from './AppPosterSection';
import { StorefrontPanel } from './StorefrontPanel';
import { useConfirm } from '../shared/useConfirm';
import { humanError } from '../../lib/errors';

/**
 * Everything about the shop itself that only the owner may change.
 */

const field =
  'w-full h-10 rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

export function ShopPanel() {
  return (
    <div className="space-y-6">
      <ProfileSection />
      <AnnouncementSection />
      <StorefrontPanel />
      <AppPosterSection />
      <ReviewSection />
    </div>
  );
}

/* ------------------------------------------------------------- shop details */

function ProfileSection() {
  const profile = useBusinessStore((s) => s.profile);
  const load = useBusinessStore((s) => s.load);
  const save = useBusinessStore((s) => s.save);

  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(profile), [profile]);

  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const setHour = (i: number, k: keyof Hours, v: string) => {
    const hours = form.hours.map((h, n) => (n === i ? { ...h, [k]: v } : h));
    setForm({ ...form, hours });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await save(form);
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(humanError(e, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const placeholders = [form.address_line, form.phone].filter((v) => v.includes('[')).length;

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <h2 className="text-sm font-semibold">Shop details</h2>
      <p className="text-xs opacity-55 mt-1 max-w-prose">
        This is what customers see on the home page, the About and Contact pages, and in search
        results. Changing it here changes it everywhere.
      </p>

      {placeholders > 0 && (
        <p className="mt-3 text-xs text-[#e8a84a]">
          {placeholders === 1 ? 'One field is' : `${placeholders} fields are`} still a placeholder in
          square brackets. Customers can see them.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Shop name" value={form.name} onChange={(v) => set('name', v)} />
        <Field label="Tagline" value={form.tagline} onChange={(v) => set('tagline', v)} />
        <label className="block sm:col-span-2">
          <span className="text-[11px] opacity-55">Short description</span>
          <textarea
            value={form.blurb}
            onChange={(e) => set('blurb', e.target.value)}
            rows={2}
            className={`${field} h-auto py-2 mt-1 resize-none`}
          />
        </label>
        <Field label="Street or stall" value={form.address_line} onChange={(v) => set('address_line', v)} />
        <Field label="Area" value={form.district} onChange={(v) => set('district', v)} />
        <Field label="City or municipality" value={form.city} onChange={(v) => set('city', v)} />
        <Field label="Province" value={form.province} onChange={(v) => set('province', v)} />
        <Field label="Contact number" value={form.phone} onChange={(v) => set('phone', v)} />
        <Field label="Email (optional)" value={form.email} onChange={(v) => set('email', v)} />
      </div>

      <h3 className="text-[11px] tracking-[0.2em] uppercase opacity-55 mt-5 mb-2">Opening hours</h3>
      <div className="space-y-2">
        {form.hours.map((h, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <label className="flex-1 min-w-[160px]">
              <span className="text-[11px] opacity-55">Days</span>
              <input value={h.days} onChange={(e) => setHour(i, 'days', e.target.value)} className={`${field} mt-1`} />
            </label>
            <label>
              <span className="text-[11px] opacity-55">Opens</span>
              <input value={h.opens} onChange={(e) => setHour(i, 'opens', e.target.value)} className={`${field} mt-1 w-28`} />
            </label>
            <label>
              <span className="text-[11px] opacity-55">Closes</span>
              <input value={h.closes} onChange={(e) => setHour(i, 'closes', e.target.value)} className={`${field} mt-1 w-28`} />
            </label>
            <button
              onClick={() => setForm({ ...form, hours: form.hours.filter((_, n) => n !== i) })}
              className="h-10 px-2 opacity-45 hover:opacity-100 hover:text-[#e87a5c]"
              aria-label="Remove this row"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            setForm({ ...form, hours: [...form.hours, { days: '', opens: '6:00 AM', closes: '8:00 PM' }] })
          }
          className="inline-flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100"
        >
          <Plus size={13} /> Add another row
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[#e87a5c]">{error}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
        {saved ? 'Saved' : 'Save shop details'}
      </button>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] opacity-55">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`${field} mt-1`} />
    </label>
  );
}

/* ----------------------------------------------------------------- reviews */

type Review = {
  id: string;
  dish_name: string;
  ticket_code: string;
  rating: number;
  comment: string;
  created_at: string;
};

function ReviewSection() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.rpc('all_reviews');
    setRows((data ?? []) as Review[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    await supabase.from('reviews').delete().eq('id', id);
    load();
  };

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Star size={16} className="text-[#e8a84a]" /> Ratings
      </h2>
      <p className="text-xs opacity-55 mt-1 max-w-prose">
        Every rating comes from a ticket that was actually paid, so these are real customers.
        Remove one only if it is abusive.
      </p>

      {loading ? (
        <div className="py-8 grid place-items-center opacity-50">
          <Loader2 className="animate-spin" size={16} />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm opacity-55">No ratings yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 items-start py-2 border-b border-[#e8dfc8]/8">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[#e8a84a] text-sm">{'★'.repeat(r.rating)}</span>
                  <span className="text-sm">{r.dish_name}</span>
                  <span className="text-[11px] opacity-40 font-mono">{r.ticket_code}</span>
                </div>
                {r.comment && <p className="text-sm opacity-70 mt-0.5">{r.comment}</p>}
              </div>
              <button
                onClick={() =>
                  confirm({
                    title: 'Delete this rating?',
                    body: 'It disappears from the dish average for good. Use this for abuse, not for a bad review.',
                    action: 'Delete rating',
                    danger: true,
                    onConfirm: () => remove(r.id),
                  })
                }
                className="opacity-40 hover:opacity-100 hover:text-[#e87a5c]"
                aria-label="Remove this rating"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
