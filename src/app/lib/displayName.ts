/**
 * What to call this person, in one place.
 *
 * A transcription of `public.display_name()`, which exists for the same
 * reason: there are four columns that might be somebody’s name, and a
 * receipt, a greeting and a staff list picking different ones is how the same
 * customer appears to be three people.
 *
 * Falls back to "there", so the worst case is "Welcome back, there" rather
 * than a greeting with a hole in it.
 */
import type { Profile } from './types';

export function displayName(profile: Profile | null | undefined): string {
  if (!profile) return 'there';
  const first = [profile.nickname, profile.username, profile.first_name, profile.full_name]
    .map((v) => v?.trim())
    .find((v) => v);
  return first || 'there';
}
