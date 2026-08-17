<?php

use App\Http\Controllers\OrderController;
use App\Http\Middleware\OptionalSupabaseToken;
use App\Http\Middleware\VerifySupabaseToken;
use App\Models\Dish;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/**
 * The spike: enough to prove Laravel can be the backend for this system without
 * anything already working being thrown away.
 *
 * Three questions, each with an endpoint that answers it plainly.
 */

// 1. Can Laravel reach the database at all, through the pooler?
//    Open on purpose: it reports the connection, never any data.
Route::get('/health', function () {
    try {
        $version = DB::selectOne('select version() as v')->v;
        $dishes = DB::selectOne('select count(*) as n from dishes')->n;

        return response()->json([
            'database' => 'connected',
            'postgres' => explode(' (', $version)[0],
            'dishes_visible' => (int) $dishes,
            'port' => config('database.connections.pgsql.port'),
        ]);
    } catch (\Throwable $e) {
        return response()->json([
            'database' => 'unreachable',
            'error' => $e->getMessage(),
        ], 500);
    }
});

// 2. Can Laravel serve real data through Eloquent?
//    Public, exactly like the menu is on the storefront: a diner has no account.
Route::get('/menu', function () {
    return response()->json(
        Dish::query()
            ->where('available', true)
            ->orderBy('category')
            ->orderBy('name')
            ->get(['id', 'name', 'tagalog', 'price', 'category', 'description', 'stock_count'])
    );
});

// 3. Can Laravel establish who the caller is, from the token Supabase issued?
//    This is the piece everything else depends on: without a trustworthy user
//    id, Laravel cannot enforce a single rule about ownership or role.
Route::middleware(VerifySupabaseToken::class)->get('/me', function (Request $request) {
    $id = $request->attributes->get('supabase_user_id');

    // The shop role is NOT in the token. It lives in public.profiles, exactly
    // where the rest of the system keeps it, so it stays server-controlled and
    // a forged token cannot promote anybody.
    $profile = DB::table('profiles')->where('id', $id)->first();

    return response()->json([
        'user_id' => $id,
        'email' => $request->attributes->get('supabase_email'),
        'role' => $profile->role ?? null,
        'full_name' => $profile->full_name ?? null,
    ]);
});

// 4. Can Laravel take a WRITE, with the money rules intact?
//
// Deliberately open to anonymous callers, because ordering has never required
// an account and a signup wall would lose the sale. The token is OPTIONAL here:
// present, the order is attached to that customer; absent, it is a guest order,
// exactly as the ticket-code flow has always worked.
Route::post('/orders', [OrderController::class, 'store'])
    ->middleware(OptionalSupabaseToken::class);
