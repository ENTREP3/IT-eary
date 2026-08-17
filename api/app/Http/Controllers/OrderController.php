<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Raising a ticket, with the pricing rules ported from the database into PHP.
 *
 * This is the migration's real cost, made visible. Everything below used to be
 * enforced by Postgres for every caller at once. Moved here, it protects only
 * the callers that come through Laravel, and it has to be right in a second
 * language.
 *
 * THE RULE THAT MATTERS: the client sends dish ids and quantities, never money.
 * Prices are re-read from the live menu on the server, so a tampered phone
 * posting {"price": 1} still pays the real total. Accepting a price from the
 * request would be the single worst thing this endpoint could do.
 */
class OrderController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'string'],
            'items.*.qty' => ['nullable', 'integer', 'min:1', 'max:99'],
            'customer_name' => ['nullable', 'string', 'max:80'],
            'payment_method' => ['nullable', 'in:cash,gcash'],
            'promo_code' => ['nullable', 'string', 'max:40'],
            'pickup_at' => ['nullable', 'date'],
        ]);

        $method = $data['payment_method'] ?? 'cash';
        $promo = strtoupper(trim($data['promo_code'] ?? '')) ?: null;

        // A signed-in customer owns their order. Staff deliberately do not: a
        // cashier testing the storefront must not bank orders, or loyalty,
        // against their own account. Mirrors create_ticket() exactly.
        $customerId = $request->attributes->get('supabase_user_id');
        if ($customerId !== null) {
            $role = DB::table('profiles')->where('id', $customerId)->value('role');
            if (in_array($role, ['admin', 'cashier'], true)) {
                $customerId = null;
            }
        }

        $settings = DB::table('payment_settings')->where('id', 1)->first();
        if ($method === 'gcash' && $settings && ! $settings->gcash_enabled) {
            throw ValidationException::withMessages(['payment_method' => 'GCash is not being accepted right now.']);
        }
        if ($method === 'cash' && $settings && ! $settings->cash_enabled) {
            throw ValidationException::withMessages(['payment_method' => 'Cash is not being accepted right now.']);
        }

        // Collapse duplicate ids the way the SQL version does, so two separate
        // lines for the same dish become one line with the summed quantity.
        $wanted = [];
        foreach ($data['items'] as $line) {
            $id = $line['id'];
            $wanted[$id] = ($wanted[$id] ?? 0) + max(1, (int) ($line['qty'] ?? 1));
        }

        $order = DB::transaction(function () use ($wanted, $data, $method, $promo, $customerId) {
            // Locking the rows keeps the price used for the total identical to
            // the price on the menu at the moment of the insert, even if the
            // owner edits it mid-checkout.
            $dishes = DB::table('dishes')
                ->whereIn('id', array_keys($wanted))
                ->where('available', true)
                ->lockForUpdate()
                ->get(['id', 'name', 'price']);

            if ($dishes->isEmpty()) {
                throw ValidationException::withMessages(['items' => 'None of the requested dishes are available.']);
            }

            $items = [];
            $subtotal = 0.0;
            foreach ($dishes as $dish) {
                $qty = $wanted[$dish->id];
                $items[] = [
                    'id' => $dish->id,
                    'name' => $dish->name,
                    'qty' => $qty,
                    'price' => (float) $dish->price,
                ];
                $subtotal += (float) $dish->price * $qty;
            }
            $subtotal = round($subtotal, 2);

            [$discount, $claimedCode] = $this->claimPromo($promo, $subtotal);

            // Left in the database on purpose. It retries on collision against
            // the live table, which is exactly the kind of check that belongs
            // next to the data rather than a network hop away from it.
            $code = DB::selectOne('select public.generate_ticket_code() as code')->code;

            DB::table('orders')->insert([
                'reference' => $code,
                'ticket_code' => $code,
                'customer_name' => trim($data['customer_name'] ?? '') ?: null,
                'customer_id' => $customerId,
                'items' => json_encode($items),
                'subtotal' => $subtotal,
                'discount' => $discount,
                'promo_code' => $claimedCode,
                'total' => round($subtotal - $discount, 2),
                'payment_method' => $method,
                'status' => 'pending',
                'payment_status' => 'unpaid',
                'pickup_at' => $data['pickup_at'] ?? null,
            ]);

            return DB::table('orders')->where('ticket_code', $code)->first();
        });

        return response()->json($order, 201);
    }

    /**
     * Works out what a code is worth and claims one redemption of it.
     *
     * @return array{0: float, 1: ?string} the discount, and the code actually charged
     */
    private function claimPromo(?string $code, float $subtotal): array
    {
        if ($code === null) {
            return [0.0, null];
        }

        // The value is computed by the same database function the storefront
        // previews with, so the cart can never quote a discount checkout then
        // refuses to honour. Reimplementing the arithmetic here would create
        // exactly that drift.
        $discount = (float) DB::selectOne(
            'select public.promo_discount_for(?, ?) as d',
            [$code, $subtotal]
        )->d;

        if ($discount <= 0) {
            return [0.0, null];
        }

        // The guard lives in the WHERE clause, so two diners racing for the last
        // redemption serialise on the row lock and the loser pays list price.
        // An if-then-update in PHP would let both through.
        $claimed = DB::update(
            'update public.promo_codes
                set used_count = used_count + 1
              where code = ?
                and (usage_limit is null or used_count < usage_limit)',
            [$code]
        );

        return $claimed === 0 ? [0.0, null] : [$discount, $code];
    }
}
