import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Toggle } from '../shared/Toggle';
import { loadNotifications } from '../../lib/notifications';

/**
 * Whether the bell shows anything, as the diner decides.
 *
 * Separate from the push switch beside it, because they are different
 * questions: one is whether the phone may interrupt you, the other is whether
 * the shop keeps a list for you to look at. Somebody who refuses to be buzzed
 * usually still wants to see what happened when they open the app.
 *
 * On by default, and off is remembered on the account rather than on the
 * device, so it follows them to their phone.
 */
export function InAppNotifyToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('my_profile').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (alive && row) setOn(row.notify_in_app !== false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Nothing while it is unknown: a switch that paints "off" and corrects itself
  // a moment later reads as having been turned off by somebody.
  if (on === null) return null;

  const flip = async (next: boolean) => {
    setBusy(true);
    setOn(next);
    try {
      await supabase.rpc('set_my_notify_in_app', { p_on: next });
      await loadNotifications();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-diner-ink/12 bg-diner-card p-4">
      <Toggle
        tone="diner"
        on={on}
        disabled={busy}
        onChange={flip}
        label="Show notifications in the app"
        hint={
          on
            ? 'Your orders and anything the shop announces appear under the bell.'
            : 'The bell stays empty. The shop still keeps a record of what it sent you.'
        }
      />
    </div>
  );
}
