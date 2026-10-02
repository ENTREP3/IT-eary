/**
 * What to call this person, in one place.
 */
import type { Profile } from './types';

export function displayName(profile: Profile | null | undefined): string {
  return realName(profile) ?? 'there';
}

/**
 * The same choice, but admitting when there is no answer.
 */
export function realName(profile: Profile | null | undefined): string | null {
  if (!profile) return null;
  const first = [profile.nickname, profile.first_name, profile.full_name]
    .map((v) => v?.trim())
    .find((v) => v);
  return first || null;
}
