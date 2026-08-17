import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../shared/useConfirm';

/**
 * Where the owner runs a promotion without needing a developer.
 *
 * The discount itself is never decided here. This screen only writes the rule;
 * the database works out what a code is worth at checkout, which is why a
 * tampered browser cannot invent one. See the promotions migration.
 */

type Promo = {
  code: string;
  label: string;
  kind: 'percent' | 'fixed';
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
};

const blank = {
  code: '',
  label: '',
  kind: 'percent' as 'percent' | 'fixed',
  value: '10',
  min_subtotal: '100',
  max_discount: '',
  ends_at: '',
  usage_limit: '',
};

export function PromotionsPanel() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: err } = await supabase
      .from('promo_codes')
      .select('code, label, kind, value, min_subtotal, max_discount, ends_at, usage_limit, used_count, active')
      .order('created_at', { ascending: false });
    if (!err) setRows((data ?? []) as Promo[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) return setError('Give the code a name, for example SULIT10.');
    const value = Number(form.value);
    if (!Number.isFinite(value) || value <= 0) return setError('The discount must be more than zero.');
    if (form.kind === 'percent' && value > 100) return setError('A percentage cannot be more than 100.');

    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('promo_codes').insert({
      code,
      label: form.label.trim() || `${form.kind === 'percent' ? `${value}% off` : `${value} pesos off`}`,
      kind: form.kind,
      value,
      min_subtotal: Number(form.min_subtotal) || 0,
      max_discount: form.max_discount ? Number(form.max_discount) : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setForm(blank);
    load();
  };

  const toggle = async (p: Promo) => {
    await supabase.from('promo_codes').update({ active: !p.active }).eq('code', p.code);
    load();
  };

  const remove = async (code: string) => {
    await supabase.from('promo_codes').delete().eq('code', code);
    load();
  };

  const field =
    'w-full h-10 rounded-lg border px-3 text-sm outline-none bg-[#0f1410] border-[#e8dfc8]/15 text-[#e8dfc8] placeholder:text-[#e8dfc8]/35 focus:border-[#e8a84a]/60';

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------ new promo */}
      <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Tag size={16} className="text-[#e8a84a]" /> Run a new promotion
        </h2>
        <p className="text-xs opacity-55 mt-1 max-w-prose">
          Diners type the code at checkout. The discount is worked out by the system when the
          order is priced, so it cannot be faked or used past its limit.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-[11px] opacity-55">Code</span>
            <input
              className={`${field} mt-1 uppercase tracking-wider`}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="HAPON15"
            />
          </label>

          <label className="block">
            <span className="text-[11px] opacity-55">Type of discount</span>
            <select
              className={`${field} mt-1`}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as 'percent' | 'fixed' })}
            >
              <option value="percent">Percentage off</option>
              <option value="fixed">Pesos off</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] opacity-55">
              {form.kind === 'percent' ? 'Percent off' : 'Pesos off'}
            </span>
            <input
              className={`${field} mt-1`}
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-[11px] opacity-55">Minimum spend</span>
            <input
              className={`${field} mt-1`}
              type="number"
              value={form.min_subtotal}
              onChange={(e) => setForm({ ...form, min_subtotal: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-[11px] opacity-55">Most it can take off (optional)</span>
            <input
              className={`${field} mt-1`}
              type="number"
              value={form.max_discount}
              onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
              placeholder="No cap"
            />
          </label>

          <label className="block">
            <span className="text-[11px] opacity-55">How many times it can be used (optional)</span>
            <input
              className={`${field} mt-1`}
              type="number"
              value={form.usage_limit}
              onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
              placeholder="Unlimited"
            />
          </label>

          <label className="block">
            <span className="text-[11px] opacity-55">Ends on (optional)</span>
            <input
              className={`${field} mt-1`}
              type="date"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </label>

          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="text-[11px] opacity-55">What diners see</span>
            <input
              className={`${field} mt-1`}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="15 pesos off merienda"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-[#e87a5c]">{error}</p>}

        <button
          onClick={create}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#e8a84a] text-[#0a0d0a] text-sm font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Start this promotion
        </button>
      </section>

      {/* --------------------------------------------------- existing list */}
      <section className="rounded-2xl border border-[#e8dfc8]/12 bg-[#0a0d0a] p-5">
        <h2 className="text-sm font-semibold">Promotions</h2>

        {loading ? (
          <div className="py-10 grid place-items-center opacity-50">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm opacity-55 mt-3">No promotions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider opacity-45 text-left">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">What diners see</th>
                  <th className="py-2 pr-3">Takes off</th>
                  <th className="py-2 pr-3">Minimum</th>
                  <th className="py-2 pr-3">Used</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.code} className="border-t border-[#e8dfc8]/10">
                    <td className="py-2.5 pr-3 font-mono tracking-wider">{p.code}</td>
                    <td className="py-2.5 pr-3 opacity-75">{p.label}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {p.kind === 'percent' ? `${p.value}%` : `₱${p.value}`}
                      {p.max_discount ? <span className="opacity-50"> up to ₱{p.max_discount}</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums opacity-75">₱{p.min_subtotal}</td>
                    <td className="py-2.5 pr-3 tabular-nums opacity-75">
                      {p.used_count}
                      {p.usage_limit ? ` of ${p.usage_limit}` : ''}
                    </td>
                    <td className="py-2.5 pr-3">
                      <button
                        onClick={() => toggle(p)}
                        className={`text-[11px] px-2 py-1 rounded-full border ${
                          p.active
                            ? 'border-[#8cc07a]/50 text-[#8cc07a]'
                            : 'border-[#e8dfc8]/25 opacity-60'
                        }`}
                      >
                        {p.active ? 'Running' : 'Paused'}
                      </button>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() =>
                          confirm({
                            title: 'Delete ' + p.code + '?',
                            body: 'Diners who have not used it yet will be told the code does not exist.',
                            action: 'Delete code',
                            danger: true,
                            onConfirm: () => remove(p.code),
                          })
                        }
                        className="opacity-45 hover:opacity-100 hover:text-[#e87a5c]"
                        aria-label={`Delete ${p.code}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
