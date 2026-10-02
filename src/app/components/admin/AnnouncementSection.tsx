import React, { useEffect, useState } from 'react';
import { Check, Loader2, Megaphone, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../shared/useConfirm';
import { humanError } from '../../lib/errors';
import { notifyAnnouncement } from '../../lib/notify';

/**
 * Saying one thing to every diner at once.
 */

const field =
  'w-full rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

const LIMIT = 280;

type Audience = 'diners' | 'staff' | 'both';

type Row = {
  id: string;
  message: string;
  tone: 'notice' | 'warning';
  audience: Audience;
  notify: boolean;
  starts_at: string;
  ends_at: string;
};

const WHO: Record<Audience, string> = {
  diners: 'Customers',
  staff: 'Staff only',
  both: 'Everyone',
};

/** How long it runs: a number the owner types, and a unit. */
const UNITS = {
  minutes: { label: 'minutes', ms: 60e3 },
  hours: { label: 'hours', ms: 3600e3 },
  days: { label: 'days', ms: 86400e3 },
  weeks: { label: 'weeks', ms: 7 * 86400e3 },
  months: { label: 'months', ms: 30 * 86400e3 },
} as const;

type Unit = keyof typeof UNITS | 'today';

/** The longest an announcement may run, so none of them becomes furniture. */
const MAX_MS = 180 * 86400e3;

function endsAt(unit: Unit, amount: number): Date {
  if (unit === 'today') return endOfToday();
  const ms = Math.min(Math.max(amount, 1) * UNITS[unit].ms, MAX_MS);
  return new Date(Date.now() + ms);
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function when(row: Row): { text: string; live: boolean } {
  const now = Date.now();
  const starts = new Date(row.starts_at).getTime();
  const ends = new Date(row.ends_at).getTime();
  if (now < starts) return { text: 'Scheduled', live: false };
  if (now >= ends) return { text: 'Finished', live: false };
  return { text: 'Showing now', live: true };
}

export function AnnouncementSection() {
  const confirm = useConfirm();

  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'notice' | 'warning'>('notice');
  const [audience, setAudience] = useState<Audience>('diners');
  const [notify, setNotify] = useState(false);
  const [unit, setUnit] = useState<Unit>('today');
  const [amount, setAmount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The owner's list, unlike the diner's, is not filtered to what is live.
   * A screen that hid finished announcements would give no way to tell a
   * message that ran its course from one that was never saved at all.
   */
  const load = async () => {
    const { data, error: e } = await supabase
      .from('announcements')
      .select('id, message, tone, audience, notify, starts_at, ends_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (e) return setError(humanError(e, 'Could not load announcements.'));
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    load();
  }, []);

  const publish = async () => {
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.from('announcements').insert({
        message: text,
        tone,
        audience,
        notify,
        ends_at: endsAt(unit, amount).toISOString(),
      });
      if (e) throw e;

      // Only once the row is safely in. A notification for an
      // announcement that failed to save would point at nothing.
      if (notify) notifyAnnouncement(text, audience);

      setMessage('');
      setTone('notice');
      setNotify(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await load();
    } catch (e) {
      setError(humanError(e, 'Could not post that.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const { error: e } = await supabase.from('announcements').delete().eq('id', id);
    if (e) return setError(humanError(e, 'Could not remove that.'));
    await load();
  };

  const left = LIMIT - message.length;

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Megaphone size={16} className="text-[#e8a84a]" /> Announcement
      </h2>
      <p className="text-xs opacity-55 mt-1 max-w-prose">
        Shows at the top of the menu for every customer, whether or not they have an account.
        Use it for today — closing early, a brownout, a dish that will run out. Every
        announcement ends by itself; nothing here stays up forever.
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, LIMIT))}
        rows={3}
        placeholder="Sarado kami ngayong hapon, may brownout sa palengke. Bukas po ulit 6AM."
        className={`${field} mt-4 py-2 resize-none`}
      />

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[11px] opacity-55">Kind</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as 'notice' | 'warning')}
            className={`${field} h-10 mt-1`}
          >
            <option value="notice">Notice</option>
            <option value="warning">Important</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] opacity-55">Who sees it</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            className={`${field} h-10 mt-1`}
          >
            <option value="diners">Customers</option>
            <option value="staff">Staff only</option>
            <option value="both">Everyone</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] opacity-55">Show for</span>
          <div className="flex gap-2 mt-1">
            {/* Hidden for "rest of today", which is the one choice with no
                number to type. */}
            {unit !== 'today' && (
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                className={`${field} h-10 w-16 text-center`}
                aria-label="How many"
              />
            )}
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              className={`${field} h-10`}
            >
              <option value="today">Rest of today</option>
              {Object.entries(UNITS).map(([key, u]) => (
                <option key={key} value={key}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <span className="block mt-1 text-[11px] opacity-45">
            Ends {endsAt(unit, amount).toLocaleString()}
          </span>
        </label>

        <span className={`text-[11px] ml-auto ${left < 30 ? 'text-[#e8a84a]' : 'opacity-45'}`}>
          {left} left
        </span>
      </div>

      <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
          className="mt-0.5 accent-[#e8a84a]"
        />
        <span className="text-xs leading-relaxed">
          <span className="font-medium">Also send a notification</span>
          <span className="block opacity-55">
            Buzzes the phone of everyone who allowed notifications, even with the app closed.
            Worth it for closing early. Not worth it for today&rsquo;s ulam &mdash; people who
            are buzzed about everything stop reading any of it.
          </span>
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-[#e87a5c]">{error}</p>}

      <button
        onClick={publish}
        disabled={busy || !message.trim()}
        className="mt-3 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium disabled:opacity-40"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
        {saved ? 'Posted' : 'Post announcement'}
      </button>

      {rows.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {rows.map((r) => {
            const state = when(r);
            return (
              <li
                key={r.id}
                className="flex items-start gap-3 text-sm py-2 border-b border-[#e8dfc8]/8"
              >
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${
                    state.live
                      ? 'border-[#8cc07a]/50 text-[#8cc07a]'
                      : 'border-[#e8dfc8]/20 opacity-50'
                  }`}
                >
                  {state.text}
                </span>
                <span className={`flex-1 ${state.live ? '' : 'opacity-50'}`}>
                  {r.message}
                  <span className="block text-[11px] opacity-45 mt-0.5">
                    {WHO[r.audience] ?? r.audience}
                    {r.notify ? ' · notified' : ''}
                  </span>
                </span>
                <button
                  onClick={() =>
                    confirm({
                      title: state.live ? 'Take this down?' : 'Delete this announcement?',
                      body: state.live
                        ? 'It disappears from every customer screen straight away.'
                        : 'It has already finished, so nobody is seeing it now.',
                      action: state.live ? 'Take it down' : 'Delete',
                      danger: true,
                      onConfirm: () => remove(r.id),
                    })
                  }
                  className="opacity-40 hover:opacity-100 hover:text-[#e87a5c] shrink-0"
                  aria-label="Remove this announcement"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
