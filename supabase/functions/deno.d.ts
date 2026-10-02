/**
 * The bits of Deno the edge functions use, declared so an editor stops
 * underlining them.
 */

declare namespace Deno {
  /** Environment variables, which is how secrets reach a deployed function. */
  export const env: {
    get(key: string): string | undefined;
  };

  /** Deno's built-in HTTP server, the entry point of every edge function. */
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
