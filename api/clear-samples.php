<?php

/**
 * Clears the invented data the system was built and demonstrated against.
 *
 * The menu was replaced with the shop's real one, but the rest of the seed
 * outlived it: promotions nobody is running, expenses nobody paid, and a
 * fortnight of sales that never happened. None of it is harmless. Fake sales
 * are what the dashboard averages, what the bestseller panel reads, and what
 * the profit figure is drawn from — so left in place they do not merely clutter
 * the screen, they give the owner wrong answers about their own shop.
 *
 * What it does NOT touch: the shop's own settings, the payment settings, and
 * the staff accounts. Those are real, or are placeholders only the owner can
 * fill in.
 *
 *   docker exec it-eary-api-1 php clear-samples.php          what would go
 *   docker exec it-eary-api-1 php clear-samples.php --write  do it
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$write = in_array('--write', $argv, true);

$counts = [
    'orders'                 => DB::table('orders')->count(),
    'promo_redemptions'      => DB::table('promo_redemptions')->count(),
    'promo_codes'            => DB::table('promo_codes')->count(),
    'expenses'               => DB::table('expenses')->count(),
    'reviews'                => DB::table('reviews')->count(),
    'stock_alerts'           => DB::table('stock_alerts')->count(),
    'inventory_cost_history' => DB::table('inventory_cost_history')->count(),
];

echo $write ? "CLEARING\n\n" : "DRY RUN — nothing will be changed\n\n";
foreach ($counts as $table => $n) {
    printf("  %-24s %d row(s) to remove\n", $table, $n);
}

echo "\nkept, because it is real or only the owner can fill it in:\n";
printf("  %-24s %d dishes, %d ingredients, %d recipe lines\n",
    'the menu', DB::table('dishes')->count(), DB::table('inventory')->count(),
    DB::table('recipe_items')->count());
printf("  %-24s tagline, address, hours, storefront settings\n", 'business_settings');
printf("  %-24s cash/GCash switches and the GCash number\n", 'payment_settings');
printf("  %-24s %d account(s)\n", 'staff logins',
    DB::table('profiles')->whereIn('role', ['admin', 'cashier'])->count());

if (! $write) {
    echo "\nrun again with --write to apply\n";
    exit;
}

DB::transaction(function () {
    // Redemptions reference orders and codes, so they go first.
    DB::table('promo_redemptions')->delete();
    DB::table('reviews')->delete();
    DB::table('stock_alerts')->delete();
    DB::table('orders')->delete();
    DB::table('promo_codes')->delete();
    DB::table('expenses')->delete();
    // Cost history is a record of prices changing; the seeded ones describe
    // ingredients that no longer exist.
    DB::table('inventory_cost_history')->delete();

    // Nothing has been sold, so nothing has sold today.
    DB::table('dishes')->update(['sold_today' => 0]);
});

echo "\ndone. what is left:\n";
foreach (array_keys($counts) as $table) {
    printf("  %-24s %d\n", $table, DB::table($table)->count());
}
printf("  %-24s %d\n", 'dishes', DB::table('dishes')->count());
printf("  %-24s %d\n", 'inventory', DB::table('inventory')->count());
