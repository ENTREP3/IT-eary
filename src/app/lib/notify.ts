/**
 * Asking the server to notify somebody, without ever making staff wait for it.
 *
 * Every call here happens *after* the real work has already committed. The
 * status change, the refund, the announcement — those are the job, and they
 * are done by the time this runs. A notification that fails must not make the
 * counter think the order did not advance, and must never put a spinner
 * between a cook and the next ticket.
 *
 * So every failure is swallowed. That is not carelessness about errors: there
 * is no action the person at the till could take in response, and the thing
 * they were doing succeeded. Diners still get realtime updates on their ticket
 * screen regardless, so a notification is an improvement on what already
 * happens, never the only way anybody finds out.
 */
import { supabase } from './supabase';

type Audience =
  /** Every device that has ever agreed to be notified. Announcements only. */
  | { kind: 'everyone' }
  | { kind: 'ticket'; ticket_code: string }
  | { kind: 'users'; user_ids: string[] }
  | { kind: 'staff' }
  | { kind: 'admins' }
  | { kind: 'dish_waiters'; dish_id: string };

type Message = {
  to: Audience;
  title: string;
  body?: string;
  /** Where tapping it should land. */
  url?: string;
  /**
   * Notifications sharing a tag replace each other instead of stacking. One
   * ticket's updates are one running story, not four separate ones.
   */
  tag?: string;
};

/** Fire and forget, deliberately. See the note at the top of this file. */
function send(message: Message): void {
  void supabase.functions.invoke('send-push', { body: message }).catch(() => {
    /* nothing useful can be done about this here */
  });
}

/* ------------------------------------------------------------------ diners */

/**
 * Only some status changes are worth interrupting somebody for.
 *
 * 'paid' and 'preparing' are left out on purpose: the diner is standing at the
 * counter watching it happen, and their ticket screen already updates itself.
 * A buzz to say what somebody is currently looking at teaches them to ignore
 * the next one, which will be the one that mattered.
 */
const TICKET_NEWS: Record<string, { title: string; body: string } | undefined> = {
  ready: {
    title: 'Your order is ready',
    body: 'Come to the counter whenever you are ready.',
  },
  cancelled: {
    title: 'Your order was cancelled',
    body: 'Ask at the counter if you were not expecting this.',
  },
};

export function notifyTicket(ticketCode: string, status: string): void {
  const news = TICKET_NEWS[status];
  if (!news) return;
  send({
    to: { kind: 'ticket', ticket_code: ticketCode },
    title: news.title,
    body: news.body,
    url: '/account',
    tag: `ticket-${ticketCode}`,
  });
}

/** Money going back is always worth saying, and saying precisely. */
export function notifyRefund(ticketCode: string, amount: number): void {
  send({
    to: { kind: 'ticket', ticket_code: ticketCode },
    title: 'You have been refunded',
    body: `₱${amount.toFixed(2)} for ticket ${ticketCode}.`,
    url: '/account',
    tag: `ticket-${ticketCode}`,
  });
}

/**
 * Telling the people who asked that a dish is back.
 *
 * The button that put them on this list says "We will tell you when this is
 * back", which until now the shop had no way of doing — it recorded the
 * request and waited for the diner to happen to look again.
 */
export function notifyDishBack(dishId: string, dishName: string): void {
  send({
    to: { kind: 'dish_waiters', dish_id: dishId },
    title: `${dishName} is back`,
    body: 'You asked to be told. It is on the menu again now.',
    url: '/menu',
    tag: `dish-${dishId}`,
  });
}

/** A reward is only good news, so it can afford to sound like it. */
export function notifyReward(userId: string): void {
  send({
    to: { kind: 'users', user_ids: [userId] },
    title: 'You have earned a free dish',
    body: 'Your reward is waiting on your account page.',
    url: '/account',
    tag: 'loyalty',
  });
}

/**
 * An announcement, pushed to whoever it was written for.
 *
 * The banner only reaches somebody with the app already open, which is the
 * wrong half of the audience for "we are closing early" — the people who need
 * it are the ones about to make a trip.
 */
export function notifyAnnouncement(message: string, audience: 'diners' | 'staff' | 'both'): void {
  if (audience !== 'staff') {
    send({
      to: { kind: 'everyone' },
      // The shop's own name, because this is the shop speaking rather than
      // anything about a particular order.
      title: 'Bencris',
      body: message,
      url: '/',
      tag: 'announcement',
    });
  }

  if (audience !== 'diners') {
    send({
      to: { kind: 'staff' },
      title: 'Message from the owner',
      body: message,
      url: '/',
      tag: 'announcement',
    });
  }
}

/* ------------------------------------------------------------------- staff */

/** Something at the counter needs a person. */
export function notifyStaff(title: string, body: string, url = '/'): void {
  send({ to: { kind: 'staff' }, title, body, url, tag: 'counter' });
}

/** Something only the owner can decide about. */
export function notifyOwner(title: string, body: string, url = '/', tag = 'shop'): void {
  send({ to: { kind: 'admins' }, title, body, url, tag });
}
