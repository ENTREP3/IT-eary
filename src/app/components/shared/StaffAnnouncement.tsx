import React, { useEffect, useState } from 'react';
import { Megaphone, TriangleAlert, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * What the owner needs the counter to know today.
 *
 * The same table the storefront banner reads, but staff see more of it: the
 * read policies let them through to announcements addressed to `staff` as well
 * as the ones written for diners. Both are worth having on screen at the till —
 * somebody taking payments should know the shop is closing early quite as much
 * as the customers do.
 *
 * Which is why this is not the diner banner with different colours. It is the
 * same idea in the staff palette, and it deliberately shows announcements the
 * storefront would never render.
 */

type Announcement = {
  id: string;
  message: string;
  tone: 'notice' | 'warning';
  audience: 'diners' | 'staff' | 'both';
  ends_at: string;
};

export function StaffAnnouncement() {
  const [item, setItem] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, message, tone, audience, ends_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (alive) setItem((data?.[0] as Announcement) ?? null);
    };
    load();

    /*
     * A name of its own per mount, not a fixed one.
     *
     * supabase.channel(name) hands back the EXISTING channel when one with
     * that topic is already open, and adding a callback to a channel that
     * has already subscribed throws. removeChannel is asynchronous, so a
     * component that unmounts and remounts — switching view, or React
     * mounting an effect twice in development — reaches for the old channel
     * before it has finished closing. That threw during render and took the
     * whole screen down with it, which is a high price for a banner.
     */
    const channel = supabase
      .channel(`staff-announcements-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  /**
   * Takes it down when it expires, without being told to.
   *
   * Expiry is the clock passing a timestamp, not a row changing, so there is no
   * database event to listen for. A till left open through closing time would
   * otherwise still be showing this afternoon's notice tomorrow morning — and
   * a till is exactly the screen nobody reloads.
   */
  useEffect(() => {
    if (!item) return;
    const left = new Date(item.ends_at).getTime() - Date.now();
    if (left <= 0) {
      setItem(null);
      return;
    }
    // setTimeout counts milliseconds in a 32-bit signed int; anything past
    // ~24.8 days overflows and fires at once.
    const id = setTimeout(() => setItem(null), Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [item]);

  if (!item || dismissed === item.id) return null;

  const warning = item.tone === 'warning';
  const Icon = warning ? TriangleAlert : Megaphone;

  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 print:hidden ${
        warning
          ? 'border-[#e87a5c]/40 bg-[#e87a5c]/5 text-[#e87a5c]'
          : 'border-[#e8a84a]/35 bg-[#e8a84a]/5 text-[#e8dfc8]'
      }`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${warning ? '' : 'text-[#e8a84a]'}`} />
      <div className="flex-1 min-w-0">
        {/* Said plainly, because a message meant for the counter and one meant
            for customers call for different reactions from the person reading
            it, and the text alone does not always make that obvious. */}
        <p className="text-[11px] uppercase tracking-wider opacity-50">
          {item.audience === 'diners' ? 'Customers are seeing this' : 'From the owner'}
        </p>
        <p className="text-sm leading-relaxed whitespace-pre-line mt-0.5">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(item.id)}
        aria-label="Dismiss"
        className="shrink-0 opacity-45 hover:opacity-100"
      >
        <X size={15} />
      </button>
    </div>
  );
}
