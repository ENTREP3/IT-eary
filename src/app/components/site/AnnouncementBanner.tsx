import React, { useEffect, useState } from 'react';
import { Megaphone, TriangleAlert, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * What the shop needs to tell everybody today.
 *
 * Closing early, a brownout at the palengke, kambing that will be gone by two.
 * None of it fits anywhere else on the storefront, because every other piece of
 * writing here answers a question the diner asked, and this one is the shop
 * speaking first.
 *
 * A strip above the menu rather than a dialog over it. Somebody opening this
 * site has come to see what is cooking, and a modal between them and the food
 * to say "we close at 2 today" is the site serving itself. It can be dismissed,
 * because a person who has read it should not have to keep reading it.
 *
 * Nothing here waits for the network: the banner is absent until the row
 * arrives, so a slow or unreachable Supabase costs the menu nothing.
 */

type Announcement = {
  id: string;
  message: string;
  tone: 'notice' | 'warning';
  ends_at: string;
};

/**
 * The live announcement, or null.
 *
 * Only one shows at a time, newest first. Stacking them would turn the top of
 * the menu into a noticeboard, and the second-most-important thing the shop has
 * to say today is rarely worth pushing the food further down the page.
 */
async function fetchLive(): Promise<Announcement | null> {
  const { data } = await supabase
    .from('announcements')
    .select('id, message, tone, ends_at')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as Announcement) ?? null;
}

export function AnnouncementBanner() {
  const [item, setItem] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await fetchLive();
      if (alive) setItem(next);
    };
    load();

    // The row is filtered by an RLS predicate on now(), so a client that asks
    // again after the start time gets it and one that asks before does not.
    const channel = supabase
      .channel('announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  /**
   * Take it down when it expires, without being told to.
   *
   * Expiry is the clock passing a timestamp, not a row changing, so there is no
   * database event to listen for and realtime will never mention it. A phone
   * left open on the menu through closing time would otherwise still be
   * advertising this afternoon's notice tomorrow morning.
   */
  useEffect(() => {
    if (!item) return;
    const left = new Date(item.ends_at).getTime() - Date.now();
    if (left <= 0) {
      setItem(null);
      return;
    }
    // setTimeout is a 32-bit signed count of milliseconds: anything above ~24.8
    // days overflows and fires immediately. Announcements are far shorter than
    // that, but clamping costs nothing and the failure would be baffling.
    const id = setTimeout(() => setItem(null), Math.min(left, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [item]);

  if (!item || dismissed === item.id) return null;

  const warning = item.tone === 'warning';
  const Icon = warning ? TriangleAlert : Megaphone;

  return (
    <div
      role="status"
      className={`mx-auto max-w-5xl px-4 ${warning ? 'text-diner-accent' : ''}`}
    >
      <div
        className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
          warning
            ? 'border-diner-accent/40 bg-diner-accent/5'
            : 'border-diner-ink/15 bg-diner-card'
        }`}
      >
        <Icon size={17} className="mt-0.5 shrink-0" />
        <p className="flex-1 text-sm leading-relaxed whitespace-pre-line">{item.message}</p>
        <button
          type="button"
          onClick={() => setDismissed(item.id)}
          aria-label="Dismiss this notice"
          className="shrink-0 opacity-45 hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
