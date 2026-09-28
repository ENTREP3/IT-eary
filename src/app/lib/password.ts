/**
 * The same password rule the database enforces, said in the browser.
 *
 * A copy, and copies drift — so it is deliberately a transcription of
 * `public.password_problem()` and nothing more. The database is what actually
 * refuses a weak password; this exists so somebody is told while they are
 * still typing, rather than after a round trip that ends in a red box.
 *
 * If the two ever disagree the server wins, which is the right way round: the
 * worst this can do is let something through that is then refused, never the
 * reverse.
 *
 * Returns what to do next, not a verdict. "Add a capital letter" gets a person
 * to a working password; "not strong enough" leaves them guessing.
 */
export function passwordProblem(password: string): string | null {
  if (!password || password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Add a small letter.';
  if (!/[A-Z]/.test(password)) return 'Add a capital letter.';
  if (!/[0-9]/.test(password)) return 'Add a number.';
  // Anything that is not a letter, a digit or a space, so somebody on a
  // keyboard we have never seen is not told their symbol is the wrong sort.
  if (!/[^a-zA-Z0-9\s]/.test(password)) return 'Add a symbol, such as ! or @ or #.';
  return null;
}
