/**
 * The bits of Deno the edge functions use, declared so an editor stops
 * underlining them.
 *
 * Everything under supabase/functions runs on Deno inside Supabase, not on
 * Node and not in a browser. The project's tsconfig only covers `src`, so
 * `npm run typecheck` ignores these files entirely — but an editor opening one
 * falls back to the project's browser settings, finds no `Deno` global, and
 * marks every line that touches it. That noise is worse than useless: it
 * buries the errors that would actually matter.
 *
 * Only what is genuinely used is declared. A fuller set would be a second,
 * hand-maintained copy of Deno's own types, and it would drift.
 *
 * With the Deno extension installed, `deno.json` beside this file takes over
 * and this is simply redundant rather than wrong.
 */

declare namespace Deno {
  /** Environment variables, which is how secrets reach a deployed function. */
  export const env: {
    get(key: string): string | undefined;
  };

  /** Deno's built-in HTTP server, the entry point of every edge function. */
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
