<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A diner waiting to hear that a sold-out dish is back.

 * Flagged by a trigger when the dish returns, so nobody has to remember.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class StockAlert extends Model
{
    protected $table = 'stock_alerts';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'notified_at' => 'datetime',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
