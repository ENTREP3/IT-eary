import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useConfirm } from '../shared/useConfirm';

/**
 * Keeping GCash receipts for as long as they are useful, and no longer.
 *
 * Receipts were kept forever. That is fine for a while and then it is not: the
 * free tier is 1 GB, and a receipt carries the sender's real name and mobile
 * number, so holding thousands of them indefinitely is a liability as much as a
 * storage problem.
 *
 * The rule enforced here is that nothing can be deleted until it has been
 * downloaded IN THIS SESSION. A dialog that merely suggests downloading first is
 * something people learn to click through; a delete button that stays disabled
 * until the file is safely on the owner's machine cannot be clicked through.
 */

type Doomed = {
  ticket_code: string;
  proof_path: string;
  created_at: string;
  total: number;
};

const AGES = [
  { label: 'Older than 30 days', days: 30 },
  { label: 'Older than 60 days', days: 60 },
  { label: 'Older than 90 days', days: 90 },
  { label: 'Everything', days: 0 },
];

export function ReceiptRetention() {
  const confirm = useConfirm();

  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<Doomed[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Which batch has been safely downloaded. Keyed by the age selected, so
   * changing the selection correctly re-arms the guard: having downloaded the
   * 90 day batch says nothing about the 30 day one.
   */
  const [downloaded, setDownloaded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('orders')
      .select('ticket_code, proof_path, created_at, total')
      .not('proof_path', 'is', null)
      .order('created_at');

    if (days > 0) {
      q = q.lt('created_at', new Date(Date.now() - days * 86_400_000).toISOString());
    }

    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as Doomed[]);
  }, [days]);

  useEffect(() => {
    setDownloaded(null);
    load();
  }, [load]);

  /**
   * Fetches each receipt through a short-lived signed link and saves it, then a
   * CSV naming which ticket each file belongs to. Without that list the images
   * are a folder of meaningless filenames the moment they leave the system.
   */
  const download = async () => {
    if (!rows?.length) return;
    setBusy('download');
    setError(null);
    setDone(0);

    const manifest = [['ticket_code', 'date', 'amount', 'file'].join(',')];

    try {
      for (const [i, r] of rows.entries()) {
        const { data } = await supabase.storage
          .from('payment-proofs')
          .createSignedUrl(r.proof_path, 120);

        if (data?.signedUrl) {
          const blob = await (await fetch(data.signedUrl)).blob();
          const name = `${r.ticket_code}-${r.created_at.slice(0, 10)}.jpg`;

          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          URL.revokeObjectURL(a.href);

          manifest.push([r.ticket_code, r.created_at.slice(0, 10), r.total, name].join(','));
        }
        setDone(i + 1);
      }

      const csv = new Blob([manifest.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(csv);
      a.download = `receipts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);

      setDownloaded(days);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download them all. Nothing has been deleted.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!rows?.length) return;
    setBusy('delete');
    setError(null);
    try {
      const { error: storageError } = await supabase.storage
        .from('payment-proofs')
        .remove(rows.map((r) => r.proof_path));
      if (storageError) throw storageError;

      // The order keeps its payment status and the note that it was verified.
      // Only the image goes, which is the whole point: the record of the sale
      // survives, the customer's personal details do not linger.
      const { error: rowError } = await supabase
        .from('orders')
        .update({ proof_path: null, proof_uploaded_at: null })
        .in('ticket_code', rows.map((r) => r.ticket_code));
      if (rowError) throw rowError;

      setDownloaded(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete them.');
    } finally {
      setBusy(null);
    }
  };

  const count = rows?.length ?? 0;
  const ready = downloaded === days && count > 0;

  return (
    <div className="mt-5 pt-5 border-t border-[#e8dfc8]/10">
      <h3 className="text-sm font-medium">Clearing old receipts</h3>
      <p className="text-[12px] opacity-55 mt-1 mb-3 max-w-xl leading-relaxed">
        A receipt carries the sender's name and mobile number, so keeping them
        forever is a liability as well as a storage cost. Download them first, then
        they can go. The sale itself and the fact it was verified are kept either
        way.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {AGES.map((a) => (
          <button
            key={a.days}
            onClick={() => setDays(a.days)}
            disabled={!!busy}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
              days === a.days
                ? 'border-[#e8a84a]/60 bg-[#e8a84a]/15 text-[#e8a84a]'
                : 'border-[#e8dfc8]/15 text-[#e8dfc8]/70 hover:border-[#e8dfc8]/35'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-[#c8442a]/20 text-[#e87a5c]">{error}</div>
      )}

      <div className="text-sm opacity-70 mb-3">
        {rows === null
          ? 'Counting…'
          : count === 0
            ? 'Nothing matches. There is nothing to clear.'
            : `${count} receipt${count === 1 ? '' : 's'} match${count === 1 ? 'es' : ''}.`}
        {busy === 'download' && count > 0 && (
          <span className="ml-2 text-[#e8a84a]">Downloading {done} of {count}…</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          disabled={!count || !!busy}
          className="h-9 px-4 rounded-lg text-sm font-medium bg-[#e8a84a] text-[#0a0d0a] disabled:opacity-40 inline-flex items-center gap-2"
        >
          {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download {count > 0 ? count : ''}
        </button>

        <button
          onClick={() =>
            confirm({
              title: `Delete ${count} receipt${count === 1 ? '' : 's'}?`,
              body:
                'The images are removed for good. The orders, their totals and the fact each was verified all stay. Only the pictures go.',
              action: 'Delete the images',
              danger: true,
              onConfirm: remove,
            })
          }
          disabled={!ready || !!busy}
          title={ready ? undefined : 'Download them first'}
          className="h-9 px-4 rounded-lg text-sm border border-[#c8442a]/40 text-[#e87a5c] disabled:opacity-30 inline-flex items-center gap-2"
        >
          {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Delete them
        </button>
      </div>

      {!ready && count > 0 && (
        <p className="text-[11px] opacity-45 mt-2">
          Deleting stays switched off until these have been downloaded. That is
          deliberate: a warning can be clicked through, a disabled button cannot.
        </p>
      )}
    </div>
  );
}

/** Shown on the storage card once the free allowance is genuinely under threat. */
export function StorageWarning({ pct }: { pct: number }) {
  if (pct < 75) return null;

  const critical = pct >= 90;
  return (
    <div
      className={`mt-3 flex items-start gap-2 text-[12px] rounded-lg px-3 py-2 ${
        critical ? 'bg-[#c8442a]/20 text-[#e87a5c]' : 'bg-[#e8a84a]/15 text-[#e8a84a]'
      }`}
    >
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>
        {critical
          ? 'Storage is nearly full. Once it fills, diners can no longer upload a GCash receipt and the counter loses its record of payment. Download the old receipts and clear them below.'
          : 'Storage is filling up. Worth downloading the older receipts and clearing them before it becomes urgent.'}
      </span>
    </div>
  );
}
