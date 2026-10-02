import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/**
 * What the shop has told this person, kept so it can be looked at later.
 *
 * Push notifications are shouted once. If the phone was in a pocket, or the app
 * was open at the time, or notifications were never switched on, the event is
 * gone — and in a karinderya that is most of the working day. The same rows now
 * live in `public.notifications`, written by the same call that sends the push,
 * so a bell and a phone buzz are two deliveries of one notification rather than
 * two features that have to be kept in agreement.
 *
 * One store for all three audiences. The diner, the counter and the owner see
 * different notifications because the database resolved a different audience
 * when it wrote them, not because the client filters anything — which is what
 * stops a bug here from showing somebody else's business.
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
 *
 * Returns the unsubscribe, and takes a unique channel name from the caller.
 * `supabase.channel(name)` hands back an existing channel if the name is
 * already in use, and adding a listener to a channel that has subscribed
 * throws — which is how a second mount of the same screen used to take the
 * whole app down with a white page.
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
