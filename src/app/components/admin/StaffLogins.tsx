import React, { useEffect, useState } from 'react';
import { Check, Loader2, Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../shared/useConfirm';
import { humanError } from '../../lib/errors';

/**
 * Creating and managing the logins staff sign in with.
 *
 * Lived under Shop, beside the address and the opening hours, which put the
 * one place accounts are made nowhere near the one place they are managed.
 * This is People's business.
 */

const field =
  'w-full h-10 rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

type Staff = { id: string; email: string; full_name: string | null; role: string };

export function StaffLogins() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Staff[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as 'cashier' | 'admin' });
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  // Surface a failure rather than rendering an empty list. Swallowing the error
  // made a broken query look exactly like "no staff yet", which is the worst
  // possible way for this screen to fail.
  const load = async () => {
    const { data, error } = await supabase.rpc('list_staff');
    if (error) {
      setLoadError(error.message);
      setRows([]);
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as Staff[]);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('create_staff_account', {
      p_email: form.email.trim(),
      p_password: form.password,
      p_full_name: form.name.trim(),
      p_role: form.role,
    });
    setBusy(false);
    if (error) return setMessage({ tone: 'bad', text: error.message });
    setMessage({
      tone: 'ok',
      text:
        data === 'created'
          ? `${form.email.trim()} can sign in now. Give them the password you just set.`
          : `${form.email.trim()} already had an account, so it was given ${form.role} access.`,
    });
    setForm({ name: '', email: '', password: '', role: 'cashier' });
    load();
  };

  const resetPassword = async (target: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('set_staff_password', {
      p_email: target,
      p_password: newPassword,
    });
    setBusy(false);
    if (error) return setMessage({ tone: 'bad', text: error.message });
    setMessage({ tone: 'ok', text: `New password set for ${target}.` });
    setResetting(null);
    setNewPassword('');
  };

  const revoke = async (target: string) => {
    const { error } = await supabase.rpc('revoke_staff', { target_email: target });
    if (error) return setMessage({ tone: 'bad', text: error.message });
    setMessage({ tone: 'ok', text: `${target} no longer has staff access.` });
    load();
  };

  return (
    <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Users size={16} className="text-[#e8a84a]" /> Staff logins
      </h2>
      <p className="text-xs opacity-55 mt-1 max-w-prose">
        Create the login here and hand the email and password to your staff. They do not sign up
        themselves. If the email already has a customer account, it is given staff access instead.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-[11px] opacity-55">Full name &mdash; printed on receipts</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ana Dela Cruz"
            className={`${field} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] opacity-55">Email they will sign in with</span>
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="ana@bencris.local"
            className={`${field} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] opacity-55">Password (at least 6 characters)</span>
          <input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] opacity-55">Role</span>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'cashier' | 'admin' })}
            className={`${field} mt-1`}
          >
            <option value="cashier">Cashier</option>
            <option value="admin">Owner</option>
          </select>
        </label>
      </div>

      <button
        onClick={create}
        disabled={busy || !form.name.trim() || !form.email.trim() || form.password.length < 6}
        className="mt-3 h-10 px-4 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create login
      </button>

      {message && (
        <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-[#8cc07a]' : 'text-[#e87a5c]'}`}>
          {message.text}
        </p>
      )}

      {loadError && (
        <p className="mt-4 text-sm text-[#e87a5c]">
          Could not load the staff list: {loadError}
        </p>
      )}
      {!loadError && rows.length === 0 && (
        <p className="mt-4 text-sm opacity-55">
          No staff logins yet. Create one above.
        </p>
      )}

      <ul className="mt-4 space-y-1.5">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm py-2 border-b border-[#e8dfc8]/8">
            <span className="flex-1 truncate">{s.email}</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                s.role === 'admin'
                  ? 'border-[#e8a84a]/50 text-[#e8a84a]'
                  : 'border-[#e8dfc8]/25 opacity-70'
              }`}
            >
              {s.role === 'admin' ? 'Owner' : 'Cashier'}
            </span>
            <button
              onClick={() => {
                setResetting(resetting === s.email ? null : s.email);
                setNewPassword('');
              }}
              className="text-[11px] opacity-55 hover:opacity-100"
            >
              Reset password
            </button>
            <button
              onClick={() =>
                confirm({
                  title: 'Remove access for ' + s.email + '?',
                  body: 'They keep their account and their history, but can no longer sign in to the counter or the dashboard.',
                  action: 'Remove access',
                  danger: true,
                  onConfirm: () => revoke(s.email),
                })
              }
              className="opacity-45 hover:opacity-100 hover:text-[#e87a5c]"
              aria-label={`Remove access for ${s.email}`}
            >
              <UserMinus size={15} />
            </button>
          </li>
        ))}
      </ul>

      {resetting && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[220px]">
            <span className="text-[11px] opacity-55">New password for {resetting}</span>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <button
            onClick={() => resetPassword(resetting)}
            disabled={busy || newPassword.length < 6}
            className="h-10 px-4 rounded-lg border border-[#e8dfc8]/20 text-sm disabled:opacity-40"
          >
            Set password
          </button>
          <button onClick={() => setResetting(null)} className="h-10 px-3 text-sm opacity-60">
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
