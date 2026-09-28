/**
 * Which dishes this diner is actually entitled to rate, according to the shop.
 *
 * The device already keeps its own list of what it ordered, and for a long
 * time that was the only list there was — ordering was anonymous, so there was
 * nowhere else to put it. It works right up until the diner is somewhere else:
 * ordered on their phone and looking at a laptop, cleared their browser,
 * opened the real site having tested on localhost. In every one of those the
 * button to rate a meal they genuinely ate is simply absent, and nothing
 * explains why.
 *
 * The database has always known better. `leave_review` asks only that the
 * ticket was paid, is under thirty days old, and contained the dish — it never
 * cared which browser was used. This closes the gap by asking it.
 *
 * Used alongside the device list rather than instead of it. The device answers
 * instantly and offline and covers a guest who never signs in at all; this
 * covers everyone the device has forgotten.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** How long a meal stays rateable. Mirrors the rule inside `leave_review`. */
const WINDOW_DAYS = 30;

export type Rateable = Map<string, string>;

const EMPTY: Rateable = new Map();

/**
 * Dish id to the ticket code that will be used to rate it.
 *
 * A dish eaten more than once maps to the most recent ticket, which is the one
 * the diner is thinking of.
 */
async function load(): Promise<Rateable> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400e3).toISOString();

  // No filter on who: the row-level policy already restricts this to the
  // caller's own orders, and repeating it here would only invite the two rules
  // to disagree later.
  const { data, error } = await supabase
    .from('orders')
    .select('ticket_code, items, paid_at')
    .not('paid_at', 'is', null)
    .gte('paid_at', since)
    .order('paid_at', { ascending: false })
    .limit(50);

  if (error || !data) return EMPTY;

  const map: Rateable = new Map();
  for (const order of data) {
    for (const item of (order.items ?? []) as Array<{ id?: string }>) {
      // Newest first, so the first ticket seen for a dish is the right one.
      if (item?.id && !map.has(item.id)) map.set(item.id, order.ticket_code);
    }
  }
  return map;
}

/**
 * Loaded once per mount, not kept in a store.
 *
 * It only changes when the diner places or settles an order, both of which
 * leave this screen, so there is nothing to keep in step and a store would
 * only be somewhere for it to go stale.
 */
export function useRateable(): Rateable {
  const [map, setMap] = useState<Rateable>(EMPTY);

  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return map;
}
