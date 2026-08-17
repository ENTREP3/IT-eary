<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A star rating left against a settled ticket.

 * Insert through leave_review(), which refuses a rating unless that ticket was
 * paid AND actually contained the dish. That check is why the ratings on the
 * menu mean something.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class Review extends Model
{
    protected $table = 'reviews';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $casts = [
        'rating' => 'integer',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
