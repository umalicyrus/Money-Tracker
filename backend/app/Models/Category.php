<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['id', 'user_id', 'version', 'name', 'description', 'name_key', 'type', 'icon', 'icon_image', 'is_archived', 'deleted_at'])]
class Category extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'is_archived' => 'boolean',
            'deleted_at' => 'datetime',
        ];
    }
}
