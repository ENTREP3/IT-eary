<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Who somebody is to the shop: customer, cashier or owner.

 * The id is the Supabase auth user id, which is what ties a login to a role.
 * The role is NOT taken from the login token, so a forged or stale token can
 * never promote anybody. Read it from here, always.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class Profile extends Model
{
    protected $table = 'profiles';

    protected $primaryKey = 'id';

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
