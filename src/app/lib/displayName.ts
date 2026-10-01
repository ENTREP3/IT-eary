/**
 * What to call this person, in one place.
 *
 * A transcription of `public.display_name()`. There are three columns that
 * might be somebody's name, and a receipt, a greeting and a staff list
 * picking different ones is how the same customer appears to be three
 * people.
 *
 * The nickname leads because it is the one they chose to be called. There
 * was a username above it once; it was removed because nothing signed in
 * with it, so it was a second name to pick, to keep unique, and to be told
 * was taken — for nothing the nickname was not already doing.
 *
 * Falls back to "there", so the worst case is "Welcome back, there" rather
 * than a greeting with a hole in it.
 */
import type { Profile } from './types';

export function displayName(profile: Profile | null | undefined): string {
  return realName(profile) ?? 'there';
}

/**
 * The same choice, but admitting when there is no answer.
 *
 * `displayName` is for greeting somebody, where "there" is a fine stand-in. A
 * form field is the other case: prefilling a name box with the word "there"
 * would put it on a receipt, so a caller that is going to *write* the name down
 * needs to know the difference between a name and a placeholder.
 */
export function realName(profile: Profile | null | undefined): string | null {
  if (!profile) return null;
  const first = [profile.nickname, profile.first_name, profile.full_name]
    .map((v) => v?.trim())
    .find((v) => v);
  return first || null;
}
