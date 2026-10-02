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
};

let state: State = { items: [], unread: 0, loading: false };
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
    set({ items: [], unread: 0, loading: false });
    return;
  }

  set({ loading: true });
  const [list, count] = await Promise.all([
    supabase.rpc('my_notifications', { p_limit: 30 }),
    supabase.rpc('my_unread_count'),
  ]);

  set({
    items: (list.data as Notification[]) ?? [],
    unread: Number(count.data ?? 0),
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
