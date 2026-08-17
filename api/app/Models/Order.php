<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A ticket, from the moment it is raised to the moment it is collected.

 * NEVER create one of these through Eloquent. Orders are raised by create_ticket()
 * in the database, which prices every line from the live menu, so a client cannot
 * decide what it owes. Writing here directly would walk straight around that.
 * Reading is fine, and reporting is what this model is for.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class Order extends Model
{
    protected $table = 'orders';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'items' => 'array',
        'total' => 'float',
        'subtotal' => 'float',
        'discount' => 'float',
        'paid_at' => 'datetime',
        'pickup_at' => 'datetime',
        'completed_at' => 'datetime',
        'verified_in_person' => 'boolean',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
