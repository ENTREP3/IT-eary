<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Money that left the till.

 * Two sources: what the owner types by hand (rent, gas, the tarpaulin), and
 * deliveries, which receive_stock() books automatically so a purchase is never
 * recorded twice or forgotten.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class Expense extends Model
{
    protected $table = 'expenses';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'amount' => 'float',
        'spent_on' => 'date',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
