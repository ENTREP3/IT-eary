<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The shop's own details, as one row with id 1.

 * Name, tagline, address, hours, contact and the address the printed QR poster
 * points at. Read by the website and all three mobile apps, so correcting it
 * here corrects it everywhere.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class BusinessSetting extends Model
{
    protected $table = 'business_settings';

    protected $primaryKey = 'id';

    public $incrementing = true;

    protected $casts = [
        'hours' => 'array',
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
