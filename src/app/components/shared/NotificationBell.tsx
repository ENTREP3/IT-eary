import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  clearNotifications,
  dismissNotification,
  loadNotifications,
  markNotificationsRead,
  useNotifications,
  watchNotifications,
} from '../../lib/notifications';

/**
 * The bell, for whoever is signed in.
 */
export function NotificationBell({ tone = 'staff' }: { tone?: 'staff' | 'diner' }) {
  const { items, unread, enabled } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Unique per mount. Two bells on one page — or a remount — sharing a channel
  // name is how Supabase hands back a subscribed channel and throws on the
  // listener being added to it.
  const channel = useId();

  useEffect(() => watchNotifications(`notifications-${channel}`), [channel]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Hidden rather than empty when they have switched it off, so there is no
  // bell to press that never has anything in it. After every hook: an early
  // return above one changes how many run between renders, which React counts.
  if (!enabled) return null;

  const dark = tone === 'staff';
  const skin = dark
    ? {
        button: 'border-[#e8dfc8]/15 hover:bg-[#e8dfc8]/5 text-[#e8dfc8]',
        panel: 'bg-[#0a0d0a] border-[#e8dfc8]/15 text-[#e8dfc8]',
        divide: 'border-[#e8dfc8]/10',
        muted: 'opacity-55',
      }
    : {
        button: 'border-diner-ink/15 hover:bg-diner-ink/5 text-diner-ink',
        panel: 'bg-diner-card border-diner-ink/15 text-diner-ink',
        divide: 'border-diner-ink/10',
        muted: 'opacity-60',
      };

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      // Reading them is what marks them read, and the list is refreshed on the
      // way in so an entry that arrived while the tab sat idle is there.
      if (next) {
        loadNotifications().then(markNotificationsRead);
      }
      return next;
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className={`relative w-9 h-9 grid place-items-center rounded-full border ${skin.button}`}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-[#c8442a] text-white text-[10px]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] border rounded-2xl overflow-hidden shadow-2xl z-40 ${skin.panel}`}
          >
            <div
              className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${skin.divide}`}
            >
              <span className={`text-[10px] tracking-[0.25em] uppercase ${skin.muted}`}>
                Notifications
              </span>

              {/* Clearing hides them from this list and keeps the shop's own
                  record of what it sent. Offered only when there is something
                  to clear, so the header is not half buttons on an empty
                  list. */}
              {items.length > 0 && (
                <button
                  onClick={() => clearNotifications()}
                  className={`text-[11px] ${skin.muted} hover:opacity-100 underline underline-offset-2`}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-auto">
              {items.length === 0 ? (
                <p className={`px-4 py-6 text-sm ${skin.muted}`}>
                  Nothing yet. This is where the shop tells you things.
                </p>
              ) : (
                items.map((n) => (
                  <Row
                    key={n.id}
                    divide={skin.divide}
                    muted={skin.muted}
                    notification={n}
                    onDismiss={() => dismissNotification(n.id)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({
  notification: n,
  divide,
  muted,
  onDismiss,
}: {
  onDismiss: () => void;
  notification: {
    id: string;
    title: string;
    body: string | null;
    url: string | null;
    created_at: string;
    read_at: string | null;
  };
  divide: string;
  muted: string;
}) {
  const body = (
    <>
      <p className="text-[13px] font-medium leading-snug">{n.title}</p>
      {n.body && <p className={`text-[12px] mt-0.5 leading-relaxed ${muted}`}>{n.body}</p>}
      <p className={`text-[10px] mt-1 ${muted}`}>{when(n.created_at)}</p>
    </>
  );

  // Only linked when there is somewhere to go. A row that looks clickable and
  // does nothing is worse than one that plainly does not.
  return (
    <div className={`flex items-start gap-1 border-b last:border-0 ${divide}`}>
      {n.url ? (
        <a href={n.url} className="flex-1 min-w-0 px-4 py-3 hover:bg-black/10">
          {body}
        </a>
      ) : (
        <div className="flex-1 min-w-0 px-4 py-3">{body}</div>
      )}
      <button
        onClick={onDismiss}
        aria-label="Clear this notification"
        className={`mt-3 mr-2 p-1 rounded ${muted} hover:opacity-100`}
      >
        <X size={13} />
      </button>
    </div>
  );
}

/** "just now", "12m ago", "3h ago", then the date. */
function when(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}
