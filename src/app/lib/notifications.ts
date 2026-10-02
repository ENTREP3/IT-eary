import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/**
 * What the shop has told this person, kept so it can be looked at later.
 */

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

type State = {
  items: Notification[];
  unread: number;
  loading: boolean;
  /** Whether this person wants a bell at all. Off hides it entirely. */
  enabled: boolean;
};

let state: State = { items: [], unread: 0, loading: false, enabled: true };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useNotifications(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Pulls the list and the count. Safe to call repeatedly. */
export async function loadNotifications() {
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) {
    set({ items: [], unread: 0, loading: false, enabled: true });
    return;
  }

  set({ loading: true });
  const [list, count, profile] = await Promise.all([
    supabase.rpc('my_notifications', { p_limit: 30 }),
    supabase.rpc('my_unread_count'),
    supabase.rpc('my_profile'),
  ]);

  const row = Array.isArray(profile.data) ? profile.data[0] : profile.data;
  const enabled = row ? row.notify_in_app !== false : true;

  set({
    // Nothing is fetched away when the bell is off; it is simply not shown.
    // The rows stay, so turning it back on returns the history rather than
    // starting from empty.
    items: enabled ? ((list.data as Notification[]) ?? []) : [],
    unread: enabled ? Number(count.data ?? 0) : 0,
    enabled,
    loading: false,
  });
}

/**
 * Marks everything read, which is what opening the bell means.
 *
 * The badge clears immediately rather than after the round trip. Nothing is
 * lost if the write fails — the next load reads the truth back — and a badge
 * that lingers for a moment after being looked at reads as a broken button.
 */
export async function markNotificationsRead() {
  if (state.unread === 0) return;
  const now = new Date().toISOString();
  set({
    unread: 0,
    items: state.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
  });
  await supabase.rpc('mark_notifications_read');
}

/**
 * Clears the bell without losing the record.
 *
 * The rows stay; only this person's view of them is hidden. What the shop told
 * somebody is the shop's record, and tidying a list should not erase it.
 */
export async function clearNotifications() {
  set({ items: [], unread: 0 });
  await supabase.rpc('dismiss_notifications', { p_id: null });
}

/** Hides one entry, for the x on a single row. */
export async function dismissNotification(id: string) {
  set({
    items: state.items.filter((n) => n.id !== id),
    unread: state.items.find((n) => n.id === id && !n.read_at)
      ? Math.max(0, state.unread - 1)
      : state.unread,
  });
  await supabase.rpc('dismiss_notifications', { p_id: id });
}

/**
 * Keeps the bell current while the page is open.
 */
export function watchNotifications(channelName: string) {
  loadNotifications();

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      () => {
        // Re-read rather than trusting the payload. RLS decides what this
        // person may see, and the row arriving here has already passed it —
        // but the unread count is the database's to state, not ours to guess.
        loadNotifications();
      },
    )
    .subscribe();

  const { data: auth } = supabase.auth.onAuthStateChange(() => loadNotifications());

  return () => {
    auth.subscription.unsubscribe();
    supabase.removeChannel(channel);
  };
}
