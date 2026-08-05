import { create } from 'zustand';
import { supabase } from '../lib/supabase';

/**
 * Dish ratings, shared by everyone.
 *
 * These used to live in the diner's own browser, which meant a rating helped
 * nobody but the person who left it. They now come from the database, so a
 * first-time visitor can see what previous diners thought.
 *
 * Posting is deliberately not done here: `leave_review` in the database checks
 * that the ticket was settled and actually contained the dish. This store only
 * reads averages and pushes the write through that rule.
 */

export type DishRating = { average: number; total: number };
export type Review = {
  id: string;
  dish_id: string;
  rating: number;
  comment: string;
  author_name: string | null;
  created_at: string;
};

type State = {
  ratings: Record<string, DishRating>;
  reviews: Record<string, Review[]>;
  loaded: boolean;
  load: () => Promise<void>;
  loadFor: (dishId: string) => Promise<void>;
  submit: (args: {
    ticketCode: string;
    dishId: string;
    rating: number;
    comment: string;
    authorName?: string | null;
  }) => Promise<void>;
};

export const useReviewStore = create<State>((set, get) => ({
  ratings: {},
  reviews: {},
  loaded: false,

  /** Averages for the whole menu, in one request, for the dish cards. */
  async load() {
    const { data, error } = await supabase.from('dish_ratings').select('dish_id, average, total');
    if (error) {
      // A menu that cannot show ratings is still a usable menu.
      set({ loaded: true });
      return;
    }
    const ratings: Record<string, DishRating> = {};
    for (const row of data ?? []) {
      ratings[row.dish_id as string] = {
        average: Number(row.average),
        total: Number(row.total),
      };
    }
    set({ ratings, loaded: true });
  },

  /** The individual comments, fetched only when a diner opens a dish. */
  async loadFor(dishId) {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, dish_id, rating, comment, author_name, created_at')
      .eq('dish_id', dishId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return;
    set({ reviews: { ...get().reviews, [dishId]: (data ?? []) as Review[] } });
  },

  async submit({ ticketCode, dishId, rating, comment, authorName }) {
    const { error } = await supabase.rpc('leave_review', {
      p_ticket_code: ticketCode,
      p_dish_id: dishId,
      p_rating: rating,
      p_comment: comment,
      p_author_name: authorName ?? null,
    });
    if (error) throw new Error(error.message);
    await Promise.all([get().load(), get().loadFor(dishId)]);
  },
}));
