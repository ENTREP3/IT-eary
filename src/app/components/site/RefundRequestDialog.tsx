import React, { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { deviceToken } from '../../lib/localPrefs';
import { humanError } from '../../lib/errors';
import type { Order } from '../../lib/types';

/**
 * Asking for money back, with a reason and a photograph.
 */

/** Written as a diner would say it, not as a form would label it. */
const REASONS = [
  'The food was spoiled',
  'There was hair in it',
  'There was an insect in it',
  'It was undercooked or raw',
  'It was cold',
  'Wrong dish was given',
  'Something was missing',
];

export function RefundRequestDialog({
  order,
  onClose,
  onSent,
}: {
  order: Order;
  onClose: () => void;
  onSent: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (r: string) =>
    setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!file) throw new Error('Add a photo of the food first.');
      if (picked.length === 0) throw new Error('Say what was wrong with it.');

      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `complaints/${order.ticket_code}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;

      const { error: rpcErr } = await supabase.rpc('request_refund', {
        p_ticket_code: order.ticket_code,
        p_reasons: picked,
        p_proof_path: path,
        p_note: note.trim() || null,
        p_device_token: deviceToken(),
      });
      if (rpcErr) throw rpcErr;

      onSent();
      onClose();
    } catch (e) {
      setError(humanError(e, 'Could not send that.'));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm max-h-[92vh] flex flex-col overflow-hidden rounded-3xl bg-diner-ground text-diner-ink border border-diner-ink/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-diner-ink/10 shrink-0">
          <span className="text-xs tracking-[0.25em] uppercase opacity-55">
            Ask for a refund
          </span>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 opacity-60">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <p className="text-[12px] opacity-65 leading-relaxed">
            Ticket {order.ticket_code} · ₱{Number(order.total).toFixed(2)}. The counter
            reads this and decides. Being asked is not the same as being refunded.
          </p>

          <div>
            <div className="text-[11px] opacity-55 mb-2">What was wrong with it?</div>
            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${
                    picked.includes(r)
                      ? 'border-diner-accent bg-diner-accent/10'
                      : 'border-diner-ink/15 hover:border-diner-ink/35'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(r)}
                    onChange={() => toggle(r)}
                    className="accent-diner-accent"
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {/* Required, and said so before the button is pressed rather than
              after. The counter cannot judge food it cannot see. */}
          <div>
            <div className="text-[11px] opacity-55 mb-2">
              A photo of the food — required
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-11 rounded-xl border border-dashed border-diner-ink/30 inline-flex items-center justify-center gap-2 text-sm"
            >
              <Camera size={15} />
              {file ? file.name.slice(0, 28) : 'Take or choose a photo'}
            </button>
          </div>

          <label className="block">
            <span className="text-[11px] opacity-55">Anything else (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={300}
              className="mt-1 w-full rounded-xl border border-diner-ink/15 bg-diner-card px-3 py-2 text-sm outline-none focus:border-diner-ink/40 resize-none"
            />
          </label>

          {error && <p className="text-sm text-diner-accent">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-diner-ink/10 p-4">
          <button
            onClick={send}
            disabled={busy}
            className="w-full h-11 rounded-full bg-diner-ink text-diner-ground inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Send to the counter
          </button>
        </div>
      </div>
    </div>
  );
}
