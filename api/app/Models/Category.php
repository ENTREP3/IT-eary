<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A menu grouping: Ulam, Silog, Merienda, Inumin.

 * Keyed by the name itself. The owner types these, and a category nobody has
 * named does not exist, so there is nothing an id would add.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class Category extends Model
{
    protected $table = 'categories';

    protected $primaryKey = 'name';

    public $incrementing = false;

    protected $keyType = 'string';

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
