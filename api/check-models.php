<?php

/**
 * Reads one row through every model, against the live database.
 *
 * A model that names the wrong table, key or column does not fail when it is
 * written; it fails the first time somebody uses it, usually in front of
 * whoever asked for the feature. This is the cheapest way to find that out.
 *
 * Read-only on purpose: it counts and fetches, and writes nothing.
 *
 *   docker exec it-eary-api-1 php check-models.php
 */

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$models = [
    'Dish', 'Category', 'Order', 'InventoryItem', 'Profile', 'PromoCode',
    'Review', 'Expense', 'StockAlert', 'LoyaltyReward',
    'InventoryCostHistory', 'BusinessSetting', 'PaymentSetting', 'RecipeItem',
];

$failed = 0;

foreach ($models as $name) {
    $class = 'App\\Models\\' . $name;

    try {
        $count = $class::count();
        // Fetching a row exercises the casts as well as the table name; a bad
        // cast only shows up when something is actually hydrated.
        $class::first();
        printf("  %-24s %-11s ok\n", $name, $count . ' rows');
    } catch (\Throwable $e) {
        $failed++;
        printf("  %-24s FAILED  %s\n", $name, substr($e->getMessage(), 0, 90));
    }
}

echo "\n" . ($failed === 0
    ? 'every model reads its table'
    : $failed . ' model(s) need attention') . "\n";

exit($failed === 0 ? 0 : 1);
