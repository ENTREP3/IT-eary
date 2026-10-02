/**
 * What this diner has already rated, from the shop as well as the device.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getMyRating, saveRating, type Rating } from './localPrefs';

export type MyRatings = Map<string, Rating>;

const EMPTY: MyRatings = new Map();

let current: MyRatings = EMPTY;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(value: MyRatings) => void>();

async function fetchMine(): Promise<MyRatings> {
  const { data, error } = await supabase.rpc('my_reviews');
  if (error || !data) return EMPTY;

  const map: MyRatings = new Map();
  for (const row of data as Array<{
    dish_id: string;
    ticket_code: string;
    rating: number;
    comment: string;
    created_at: string;
  }>) {
    // Newest first from the function, so the first seen for a dish is current.
    if (!map.has(row.dish_id)) {
      map.set(row.dish_id, {
        dishId: row.dish_id,
        stars: row.rating,
        comment: row.comment ?? '',
        at: row.created_at,
        ticket: row.ticket_code,
      });
    }
  }
  return map;
}

function publish(next: MyRatings) {
  current = next;
  for (const listener of listeners) listener(next);
}

function refresh(): Promise<void> {
  inFlight ??= fetchMine()
    .then((mine) => {
      /*
       * Written back to the device as well.
       *
       * Otherwise every screen that still reads the local copy — and there are
       * several — would keep disagreeing with this one, and a diner would see
       * their rating in one place and not in another.
       */
      for (const [dishId, rating] of mine) {
        if (!getMyRating(dishId)) saveRating(rating);
      }
      publish(mine);
    })
    .catch(() => publish(EMPTY))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      publish(EMPTY);
      return;
    }
    void refresh();
  });
}

/**
 * This diner's rating for one dish, wherever it is recorded.
 *
 * The device first, because it is the fresher of the two the moment a rating
 * is made and needs no network to answer.
 */
export function useMyRating(dishId: string): Rating | undefined {
  const [mine, setMine] = useState<MyRatings>(current);

  useEffect(() => {
    listeners.add(setMine);
    if (current === EMPTY) void refresh();
    return () => {
      listeners.delete(setMine);
    };
  }, []);

  return getMyRating(dishId) ?? mine.get(dishId);
}

/** Called after leaving a rating, so the shared copy is not a step behind. */
export function refreshMyRatings(): void {
  void refresh();
}
