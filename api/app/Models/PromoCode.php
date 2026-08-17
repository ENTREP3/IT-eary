<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An owner-defined discount.

 * What a code is worth is decided by promo_discount_for() in the database, and
 * redemption is claimed in the same statement that checks the limit. Do not
 * reimplement either here: checking then updating from PHP lets two diners race
 * for the last redemption and both win.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class PromoCode extends Model
{
    protected $table = 'promo_codes';

    protected $primaryKey = 'code';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'value' => 'float',
        'min_subtotal' => 'float',
        'max_discount' => 'float',
        'active' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
