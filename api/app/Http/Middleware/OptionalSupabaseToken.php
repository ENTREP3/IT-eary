<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Identifies the caller if they are signed in, and lets them through if not.
 *
 * Ordering has never required an account. On a meal costing under a hundred
 * pesos, a signup wall is the most reliable way to lose the sale, and the
 * ticket-code flow is what keeps the counter fast. So checkout must accept an
 * anonymous request.
 *
 * A BAD token is still refused rather than ignored. Quietly treating a failed
 * signature as "no user" would mean a tampered token downgrades to a guest
 * order instead of being rejected, which turns a security failure into a silent
 * one.
 */
class OptionalSupabaseToken extends VerifySupabaseToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if ($token && ! $this->identify($request, $token)) {
            return response()->json(['error' => 'That token is not valid.'], 401);
        }

        return $next($request);
    }
}
