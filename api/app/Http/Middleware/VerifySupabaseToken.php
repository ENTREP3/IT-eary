<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * Establishes who the caller is, using the token Supabase already issued them.
 *
 * The React and Flutter apps sign in against Supabase Auth, so there is no
 * second login to build here. They send that token, and this decides whether to
 * believe it.
 *
 * The token is signed with ES256 and verified against Supabase's PUBLIC key,
 * fetched from the project's JWKS endpoint. Guides that tell you to decode with
 * a shared "JWT secret" describe the older symmetric setup; this project issues
 * asymmetric keys, and following that advice fails with a signature error that
 * gives no hint as to why.
 *
 * Verification is the whole point. Reading the claims without checking the
 * signature would let anyone hand us any user id they liked.
 */
class VerifySupabaseToken
{
    /** The JWKS rarely changes, and refetching it per request would add a round trip to every call. */
    private const CACHE_KEY = 'supabase.jwks';
    private const CACHE_SECONDS = 3600;

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (! $token) {
            return response()->json(['error' => 'This endpoint needs a Supabase access token.'], 401);
        }

        if (! $this->identify($request, $token)) {
            return response()->json(['error' => 'That token is not valid.'], 401);
        }

        return $next($request);
    }

    /**
     * Verifies a token and records who it belongs to. Returns false if the
     * token cannot be trusted, so callers decide whether that is fatal.
     *
     * Shared with the optional variant, because two copies of signature
     * checking is two places for it to quietly stop being done.
     */
    protected function identify(Request $request, string $token): bool
    {
        try {
            $keys = JWK::parseKeySet($this->jwks());
            $claims = JWT::decode($token, $keys);
        } catch (\Throwable $e) {
            // Specific in the log, vague to the caller: telling a stranger
            // exactly why their forged token failed helps them forge a better
            // one.
            report($e);

            return false;
        }

        // Supabase puts the user id in `sub`. The `role` claim is the
        // Postgres-level one ("authenticated"), NOT the shop role, which lives
        // in public.profiles and must be read from the database so a stale or
        // forged token can never promote anybody.
        $request->attributes->set('supabase_user_id', $claims->sub ?? null);
        $request->attributes->set('supabase_email', $claims->email ?? null);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    private function jwks(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_SECONDS, function (): array {
            $url = rtrim((string) config('services.supabase.url'), '/').'/auth/v1/.well-known/jwks.json';

            $response = Http::timeout(10)->get($url);
            $response->throw();

            return $response->json();
        });
    }
}
