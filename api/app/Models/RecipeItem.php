<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One ingredient in one dish, measured per BATCH.

 * Recipe quantities are per batch because that is how a cook thinks: one pot of
 * sinigang takes a kilo and a half of pork and feeds twenty.
 *
 * The real key is (dish_id, inventory_id) together. Eloquent has no support for
 * composite keys, so this model is for querying and reporting; write through the
 * database functions, or by explicit where() on both columns.
 *
 * The table already exists and is owned by the database migrations. Nothing here
 * creates or alters it: Laravel is a reader of an established schema.
 */
class RecipeItem extends Model
{
    protected $table = 'recipe_items';

    protected $casts = [
        'quantity' => 'float',
    ];

    /**
     * Handled by the database. Most of these tables set created_at with a
     * default and have no updated_at at all, so letting Eloquent manage
     * timestamps would make it write a column that does not exist.
     */
    public $timestamps = false;

    protected $guarded = [];
}
