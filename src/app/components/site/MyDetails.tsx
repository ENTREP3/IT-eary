import React, { useEffect, useState } from 'react';
import { Check, Loader2, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { humanError } from '../../lib/errors';
import { useAuthStore } from '../../store/authStore';

/**
 * A diner's own details, and a way to fix them.
 */

type Details = {
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
};

const EMPTY = {
  firstName: '',
  middleName: '',
  lastName: '',
  nickname: '',
  phone: '',
};

const field =
  'w-full h-11 rounded-xl border border-diner-ink/15 bg-diner-card px-4 text-sm outline-none focus:border-diner-ink/45';

export function MyDetails() {
  /*
   * refreshProfile, not init.
   */
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [details, setDetails] = useState<Details | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: e } = await supabase.rpc('my_profile');
    if (e) return setError(humanError(e, 'Could not load your details.'));
    const row = (data?.[0] ?? null) as Details | null;
    setDetails(row);
    if (row) {
      setForm({
        firstName: row.first_name ?? '',
        middleName: row.middle_name ?? '',
        lastName: row.last_name ?? '',
        nickname: row.nickname ?? '',
        phone: row.phone ?? '',
      });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('save_my_profile', {
      p_first_name: form.firstName,
      p_last_name: form.lastName,
      p_middle_name: form.middleName || null,
      p_nickname: form.nickname || null,
      p_phone: form.phone || null,
    });
    setBusy(false);

    if (e) {
      // The messages here are written for the diner — "A first name is
      // taken", "A first name is needed" — so they pass through unchanged.
      return setError(humanError(e, 'Could not save that.'));
    }

    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await load();
    // The greeting at the top of the page reads from the auth store, which
    // would otherwise keep showing the old name until a reload.
    await refreshProfile();
  };

  if (!details) {
    return (
      <section className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
        <div className="py-6 grid place-items-center opacity-50">
          <Loader2 className="animate-spin" size={16} />
        </div>
      </section>
    );
  }

  const parts = [details.first_name, details.middle_name, details.last_name].filter(Boolean);

  return (
    <section className="rounded-3xl bg-diner-card border border-diner-ink/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Your details</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-xs text-diner-accent hover:underline"
          >
            <Pencil size={12} /> Edit
          </button>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-xs text-semantic-cash">
            <Check size={13} /> Saved
          </span>
        )}
      </div>

      {!editing ? (
        <dl className="mt-4 space-y-2.5 text-sm">
          <Line label="Name" value={parts.join(' ') || null} />
          <Line label="Nickname" value={details.nickname} />
          <Line label="Email" value={details.email} />
          <Line label="Mobile" value={details.phone} />
        </dl>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={field} placeholder="First name" value={form.firstName} onChange={set('firstName')} />
            <input className={field} placeholder="Last name" value={form.lastName} onChange={set('lastName')} />
          </div>
          <input
            className={field}
            placeholder="Middle name (optional)"
            value={form.middleName}
            onChange={set('middleName')}
          />
          <input
            className={field}
            placeholder="Nickname (optional)"
            value={form.nickname}
            onChange={set('nickname')}
          />
          <input
            className={field}
            placeholder="Mobile number (optional)"
            value={form.phone}
            onChange={set('phone')}
            inputMode="tel"
          />

          {/* The email is deliberately not editable here. Changing it means
              proving the new address is yours, which is a confirmation email
              and a different flow — offering a box that silently does not
              work would be worse than not offering one. */}
          <p className="text-xs opacity-55">
            Your email stays {details.email}. Ask at the counter if you need it changed.
          </p>

          {error && <p className="text-sm text-diner-accent">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-diner-ink text-diner-ground text-sm disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
                void load();
              }}
              className="h-10 px-4 text-sm opacity-60 hover:opacity-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && error && <p className="mt-3 text-sm text-diner-accent">{error}</p>}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4">
      <dt className="w-24 shrink-0 opacity-50 text-xs uppercase tracking-wider pt-0.5">{label}</dt>
      <dd className={value ? '' : 'opacity-40'}>{value || 'Not set'}</dd>
    </div>
  );
}
