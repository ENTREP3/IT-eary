import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { pushState, enablePush, disablePush, type PushState } from '../../lib/push';

/**
 * Where a diner turns "tell me when it's ready" on.
 */
export function NotifyToggle({ className = '' }: { className?: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Null while the check runs, and unsupported forever after on a browser that
  // cannot. Both render nothing rather than flashing a control that vanishes.
  if (state === null || state === 'unsupported') return null;

  /**
   * Blocked is a dead end, and saying so is the only honest option.
   *
   * Once a browser has been told no it will not raise the prompt again, so the
   * button genuinely cannot do anything. Leaving it enabled would let somebody
   * press it repeatedly with no feedback and conclude the shop is broken.
   */
  if (state === 'blocked') {
    return (
      <p className={`text-xs opacity-55 leading-relaxed ${className}`}>
        Notifications are blocked for this site in your browser settings. You can turn them back
        on there if you change your mind.
      </p>
    );
  }

  const on = state === 'on';

  const toggle = async () => {
    setBusy(true);
    try {
      setState(on ? await disablePush() : await enablePush());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-diner-ink/20 text-sm hover:border-diner-ink/45 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : on ? (
          <Bell size={15} />
        ) : (
          <BellOff size={15} />
        )}
        {on ? 'You will be told when food is ready' : 'Tell me when my food is ready'}
      </button>

      {/* Said after they agree, not before: somebody deciding whether to allow
          notifications wants to know what they are for, and somebody who has
          already allowed them wants to know it worked and how to undo it. */}
      <p className="mt-2 text-xs opacity-55 leading-relaxed">
        {on
          ? 'Only about your own orders, and when a dish you asked about is back. Press again to stop.'
          : 'A notification when your order is ready, even with the app closed. Nothing else.'}
      </p>
    </div>
  );
}
