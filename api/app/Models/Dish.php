<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A dish on the menu, read from the same table the React and Flutter apps read.
 *
 * The table already exists and is owned by the Supabase migrations, so nothing
 * here creates or alters it. Laravel is a reader of an established schema, not
 * its author, which is what makes running both side by side possible at all.
 */
class Dish extends Model
{
    protected $table = 'dishes';

    /** The ids are slugs like 'sinigang', chosen by the kitchen, not integers. */
    protected $keyType = 'string';

    public $incrementing = false;

    protected $casts = [
        'price' => 'float',
        'available' => 'boolean',
        'stock_count' => 'integer',
        'sold_today' => 'integer',
        'batch_yield' => 'integer',
    ];
}
