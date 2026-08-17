<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * What an ingredient cost, each time a delivery arrived.

 * Without this the system could say pork costs 350 but never that it went up
 * from 300, and the rise is the part the owner needs to see.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class InventoryCostHistory extends Model
{
    protected $table = 'inventory_cost_history';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'cost_per_unit' => 'float',
        'quantity' => 'float',
        'recorded_at' => 'datetime',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
