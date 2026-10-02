/**
 * Favourites, kept on the device for speed and on the account for keeps.
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
