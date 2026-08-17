<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How the karinderya is accepting money right now, as one row with id 1.

 * Switching a method off here stops it being offered at checkout, and
 * create_ticket() refuses it as well, so the rule holds even for a client that
 * ignores the screen.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class PaymentSetting extends Model
{
    protected $table = 'payment_settings';

    protected $primaryKey = 'id';

    public $incrementing = true;

    protected $casts = [
        'cash_enabled' => 'boolean',
        'gcash_enabled' => 'boolean',
        'updated_at' => 'datetime',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
