/**
 * The same password rule the database enforces, said in the browser.
 */
export function passwordProblem(password: string): string | null {
  if (!password || password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 64) return 'Use 64 characters or fewer.';
  if (!/[A-Z]/.test(password)) return 'Add a capital letter.';
  if (!/[0-9]/.test(password)) return 'Add a number.';
  // Anything that is not a letter, a digit or a space, so somebody on a
  // keyboard we have never seen is not told their symbol is the wrong sort.
  if (!/[^a-zA-Z0-9\s]/.test(password)) return 'Add a symbol, such as ! or @ or #.';
  return null;
}
