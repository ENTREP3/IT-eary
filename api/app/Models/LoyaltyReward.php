<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A discount earned by coming back.

 * Counted from completed orders rather than a separate tally, so the number can
 * never drift from what actually happened.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class LoyaltyReward extends Model
{
    protected $table = 'loyalty_rewards';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'earned_at' => 'datetime',
        'redeemed_at' => 'datetime',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
