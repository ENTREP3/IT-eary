/**
 * How long a diner may change a rating they have left.
 *
 * A transcription of the interval inside `leave_review`, which is what
 * actually refuses a late edit. This exists so the apps can hide a control
 * that would only produce a refusal — being told "no" after tapping is worse
 * than never being offered.
 *
 * An hour covers the mistake somebody notices: a wrong star hit while
 * scrolling, the wrong dish, a sentence they would rather rephrase. It is
 * deliberately not long enough to be a second opinion about the food, which
 * is what the rating is a record of.
 */
const AN_HOUR = 60 * 60 * 1000;

export function stillEditable(ratedAt: string | undefined): boolean {
  if (!ratedAt) return true; // nothing rated yet, so nothing is settled
  const at = new Date(ratedAt).getTime();
  if (Number.isNaN(at)) return true;
  return Date.now() - at < AN_HOUR;
}
