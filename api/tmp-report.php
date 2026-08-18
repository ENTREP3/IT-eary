<?php
require __DIR__.'/vendor/autoload.php'; $a=require_once __DIR__.'/bootstrap/app.php';
$a->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;

$out = ['dishes' => [], 'ingredients' => []];

foreach (DB::table('inventory')->orderBy('name')->get() as $i) {
    $out['ingredients'][] = [
        'id' => $i->id, 'name' => $i->name, 'unit' => $i->unit,
        'cost' => (float) $i->cost_per_unit,
    ];
}

foreach (DB::table('dishes')->orderBy('name')->get() as $d) {
    $lines = [];
    $batch = 0;
    foreach (DB::table('recipe_items as r')->join('inventory as i','i.id','=','r.inventory_id')
              ->where('r.dish_id',$d->id)->orderByDesc(DB::raw('r.quantity * i.cost_per_unit'))
              ->get(['i.name','i.unit','i.cost_per_unit','r.quantity']) as $l) {
        $cost = (float) $l->quantity * (float) $l->cost_per_unit;
        $batch += $cost;
        $lines[] = [
            'name' => $l->name, 'qty' => (float) $l->quantity, 'unit' => $l->unit,
            'unitCost' => (float) $l->cost_per_unit, 'cost' => round($cost, 2),
        ];
    }
    $out['dishes'][] = [
        'name' => $d->name, 'tagalog' => $d->tagalog, 'category' => $d->category,
        'price' => (float) $d->price, 'yield' => (int) $d->batch_yield,
        'batchCost' => round($batch, 2),
        'perServing' => round($batch / $d->batch_yield, 2),
        'lines' => $lines,
    ];
}

file_put_contents('/tmp/costing.json', json_encode($out));
echo "dishes ".count($out['dishes'])." ingredients ".count($out['ingredients'])."\n";
