<?php

/**
 * Sample content for testing the storefront controls.
 *
 * The switches looked broken because there was nothing for them to affect: two
 * ratings, no comments at all, nothing sold out and one dish with a stock limit.
 * This gives each control something visible to turn on and off.
 *
 * Everything it writes is tagged so it can be taken out again in one go:
 *
 *   docker exec it-eary-api-1 php seed-testing.php        add it
 *   docker exec it-eary-api-1 php seed-testing.php clear  take it back out
 *
 * The reviews are inserted directly rather than through leave_review(), which
 * would refuse them: that function demands a settled ticket that actually
 * contained the dish, and it is right to. This is a deliberate side door for
 * testing, which is why every row is marked.
 */

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

const TAG = 'SAMPLE';

if (($argv[1] ?? '') === 'clear') {
    $n = DB::table('reviews')->where('ticket_code', 'like', TAG . '%')->delete();
    DB::table('dishes')->update(['stock_count' => null, 'available' => true]);
    DB::table('inventory')->update(['cost_per_unit' => 0]);
    echo "removed $n sample review(s), cleared stock limits and ingredient costs,\n";
    echo "everything available again\n";
    exit;
}

/**
 * Sample ingredient costs, so the costing screens have something to work with.
 *
 * Every one of these is a guess at a Dasmariñas wet-market price and none of
 * them is the shop's own. They exist so the recipe costing, the margin warnings
 * and the price suggestions can be seen working at all — with the column at
 * zero those screens correctly refuse to show a number, which looks like they
 * are broken. The owner overwrites each one from a real receipt.
 */
$costs = [
    'rice' => 55,      'pork' => 300,     'chicken' => 220,  'beef' => 400,
    'goat' => 450,     'eggs' => 250,     'milk' => 35,      'liver' => 40,
    'garlic' => 160,   'onion' => 140,    'tomato' => 80,    'potato' => 100,
    'carrot' => 90,    'radish' => 70,    'squash' => 45,    'taro' => 90,
    'ampalaya' => 80,  'bellpepper' => 180, 'kangkong' => 15, 'beans' => 160,
    'salt' => 25,      'sugar' => 75,     'pepper' => 400,   'soy' => 65,
    'vinegar' => 45,   'fishsauce' => 70, 'bagoong' => 180,  'cooking-oil' => 120,
    'tomato-sauce' => 30, 'tamarind' => 12, 'laurel' => 20,  'wrapper' => 45,
    'gulaman' => 15,   'sago-pearl' => 90, 'ube' => 220,     'ice' => 8,
];

$priced = 0;
foreach ($costs as $id => $peso) {
    $priced += DB::table('inventory')->where('id', $id)->update(['cost_per_unit' => $peso]);
}
echo "priced $priced of " . DB::table('inventory')->count() . " ingredients\n";

$unpriced = DB::table('inventory')->where('cost_per_unit', 0)->pluck('name');
if ($unpriced->isNotEmpty()) {
    echo "  still at zero: " . $unpriced->implode(', ') . "\n";
}

$comments = [
    ['adobo',     5, 'Sakto ang alat at asim. Parang luto ni nanay.',            'Marites'],
    ['adobo',     4, 'Malambot ang manok, sana lang mas marami ang sabaw.',      'Jun'],
    ['sinigang',  5, 'Ang sarap ng asim! Perfect sa maulan na araw.',            'Aling Nena'],
    ['sinigang',  5, 'Laging fresh ang gulay. Sulit sa presyo.',                 'Rico'],
    ['lumpia',    5, 'Malutong hanggang huli. Nabili ko ulit kinabukasan.',      'Divine'],
    ['lumpia',    4, 'Masarap, medyo maliit lang para sa akin.',                 'Kuya Ben'],
    ['tapsilog',  5, 'Sarap ng tapa, hindi matigas. Almusal ko na ito araw-araw.', 'Ate Let'],
    ['kaldereta', 5, 'Malinamnam ang sarsa. Worth the wait talaga.',             'Noel'],
    ['halohalo',  4, 'Marami ang halo, sana lang mas malamig.',                  'Chesca'],
    ['sago',      3, 'Okay lang, medyo matamis para sa akin.',                   'Anon'],
];

$made = 0;
foreach ($comments as $i => [$dish, $stars, $text, $who]) {
    if (! DB::table('dishes')->where('id', $dish)->exists()) {
        echo "  skipped $dish, no such dish\n";
        continue;
    }

    // Each sample review owns a ticket code, so running this twice tops up what
    // is missing instead of doubling what is there.
    $code = TAG . str_pad((string) $i, 2, '0', STR_PAD_LEFT);
    if (DB::table('reviews')->where('ticket_code', $code)->exists()) {
        continue;
    }

    DB::table('reviews')->insert([
        'dish_id' => $dish,
        'ticket_code' => $code,
        'rating' => $stars,
        'comment' => $text,
        'author_name' => $who,
        // Marked as chosen so the "only the ones I choose" setting has
        // something to show the first time it is switched on.
        'featured' => $stars === 5,
        'created_at' => now()->subDays(10 - $i),
    ]);
    $made++;
}

// Something for "only a few left" and something for "sold out", so both
// switches have a visible effect.
DB::table('dishes')->where('id', 'lumpia')->update(['stock_count' => 2]);
DB::table('dishes')->where('id', 'kaldereta')->update(['stock_count' => 3]);
DB::table('dishes')->where('id', 'sago')->update(['stock_count' => 0, 'available' => false]);

echo "added $made sample reviews\n";
echo "lumpia 2 left, kaldereta 3 left, sago sold out\n";
echo "\nrun with 'clear' to remove all of it\n";
