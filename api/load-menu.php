<?php

/**
 * Replaces the sample menu with the shop's real one.
 *
 * Everything the karinderya actually cooks: 23 ulam, two rice servings, the
 * ingredients behind them and the recipe that ties the two together, so a batch
 * can be costed and drawn out of the store room the moment it is cooked.
 *
 * Reads api/menu.json, which is generated from the owner's own costings — the
 * quantities there are already converted into the unit each ingredient is
 * stocked in, so nothing is interpreted here.
 *
 * One transaction. A half-loaded menu is worse than an untouched one: dishes
 * without recipes cost nothing, and recipes without ingredients cannot be
 * cooked.
 *
 *   docker exec it-eary-api-1 php load-menu.php          what would change
 *   docker exec it-eary-api-1 php load-menu.php --write  do it
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$write = in_array('--write', $argv, true);
$data  = json_decode(file_get_contents(__DIR__ . '/menu.json'), true);

if (! $data) {
    exit("menu.json is missing or unreadable\n");
}

printf("%s\n", $write ? 'WRITING' : 'DRY RUN — nothing will be changed');
printf("  %d categories, %d ingredients, %d dishes, %d recipe lines\n\n",
    count($data['categories']), count($data['inventory']),
    count($data['dishes']), count($data['recipes']));

echo "currently:\n";
printf("  %d dishes, %d ingredients, %d recipe lines, %d reviews\n",
    DB::table('dishes')->count(), DB::table('inventory')->count(),
    DB::table('recipe_items')->count(), DB::table('reviews')->count());

// Reviews hang off dishes and are removed with them. They are the sample ones
// seeded for testing, and they point at dishes that will no longer exist.
$doomedReviews = DB::table('reviews')->count();
echo "  removing the old menu also removes $doomedReviews review(s) attached to it\n\n";

if (! $write) {
    echo "run again with --write to apply\n";
    exit;
}

DB::transaction(function () use ($data) {
    // Categories first: dishes reference them, and the constraint refuses a
    // dish whose category does not exist yet.
    foreach ($data['categories'] as $name) {
        DB::table('categories')->insertOrIgnore(['name' => $name]);
    }

    // Recipes before dishes and ingredients, because recipe_items holds the
    // reference that would otherwise refuse the delete.
    DB::table('recipe_items')->delete();
    DB::table('dishes')->delete();
    DB::table('inventory')->delete();

    foreach (array_chunk($data['inventory'], 40) as $chunk) {
        DB::table('inventory')->insert($chunk);
    }
    foreach (array_chunk($data['dishes'], 40) as $chunk) {
        DB::table('dishes')->insert($chunk);
    }
    foreach (array_chunk($data['recipes'], 100) as $chunk) {
        DB::table('recipe_items')->insert($chunk);
    }

    // Only now that nothing points at them.
    DB::table('categories')->whereNotIn('name', $data['categories'])->delete();
});

echo "done.\n\n";
printf("  %d dishes, %d ingredients, %d recipe lines, %d categories\n",
    DB::table('dishes')->count(), DB::table('inventory')->count(),
    DB::table('recipe_items')->count(), DB::table('categories')->count());

echo "\nwhat a batch of each dish costs, and what it leaves:\n";
foreach (DB::select("
    select d.name, d.price, d.batch_yield,
           sum(r.quantity * i.cost_per_unit) as batch_cost
      from dishes d
      join recipe_items r on r.dish_id = d.id
      join inventory i on i.id = r.inventory_id
     group by d.id, d.name, d.price, d.batch_yield
     order by d.name") as $row) {
    $per = $row->batch_cost / $row->batch_yield;
    printf("  %-30s batch %8.2f / %2d = %6.2f   price %6.2f   margin %3.0f%%\n",
        $row->name, $row->batch_cost, $row->batch_yield, $per, $row->price,
        (($row->price - $per) / $row->price) * 100);
}
