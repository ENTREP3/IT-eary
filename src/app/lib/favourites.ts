/**
 * Favourites, kept on the device for speed and on the account for keeps.
 *
 * Two copies, and each is there for a reason the other cannot serve.
 *
 * The device copy is what makes the heart fill in the same frame it is tapped,
 * what works with no signal, and what a guest who never signs in still gets.
 * Waiting for a round trip before colouring a heart would make the whole menu
 * feel broken on shop wifi.
 *
 * The account copy is the one that survives a new phone, a cleared browser, or
 * two people sharing a handset — which was the real problem, because a list
 * that belongs to the device shows your sister's favourites to you.
 *
 * The device is therefore always written first and never waited on. The server
 * write is sent after and its failure is swallowed: the worst case is a heart
 * that does not follow the diner to their next phone, which is exactly where
 * they were before this existed.
 */
import { supabase } from './supabase';
import { getFavourites, toggleFavourite as toggleLocally, setFavourites } from './localPrefs';

/** Marks or unmarks a dish. Returns whether it is now a favourite. */
export function toggleFavourite(dishId: string): boolean {
  const nowFavourite = toggleLocally(dishId);

  // Deliberately not awaited. See the note above.
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const me = data.user?.id;
      if (!me) return;

      if (nowFavourite) {
        await supabase.from('favourites').insert({ user_id: me, dish_id: dishId });
      } else {
        await supabase.from('favourites').delete().eq('user_id', me).eq('dish_id', dishId);
      }
    } catch {
      /* the device already has it; the account catching up is a bonus */
    }
  })();

  return nowFavourite;
}

/**
 * Brings the device's list and the account's list together.
 *
 * Neither wins. A diner may have hearted things on this phone before signing
 * in, and their account may have things hearted on another device; taking
 * either side as the truth silently deletes the other, and a disappearing
 * favourite is the kind of small wrongness nobody reports but everybody
 * notices.
 *
 * Safe to call on every sign-in and every load. The merge is idempotent, and
 * with no session it does nothing at all.
 */
export async function syncFavourites(): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data, error } = await supabase.rpc('merge_favourites', {
      p_dish_ids: getFavourites(),
    });
    if (error) return;

    // The function returns the union, which is what both sides should now hold.
    const merged = ((data ?? []) as Array<string | { dish_id: string }>).map((row) =>
      typeof row === 'string' ? row : row.dish_id,
    );
    setFavourites(merged);
  } catch {
    /* offline, or signed out mid-flight: the device list is untouched */
  }
}
