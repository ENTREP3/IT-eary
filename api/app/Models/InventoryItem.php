<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An ingredient the kitchen buys and cooks with.

 * Stock only ever moves two ways: cook_batch() takes it out, receive_stock()
 * puts it back and records what was paid. Both live in the database so the
 * figure always has an explanation.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class InventoryItem extends Model
{
    protected $table = 'inventory';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'stock' => 'float',
        'reorder_at' => 'float',
        'par_level' => 'float',
        'cost_per_unit' => 'float',
        'last_received_at' => 'datetime',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
