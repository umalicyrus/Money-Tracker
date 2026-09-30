<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['id', 'user_id', 'version', 'type', 'wallet_id', 'destination_wallet_id', 'category_id', 'amount_minor', 'transaction_date', 'note', 'items', 'deleted_at'])]
class Transaction extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'amount_minor' => 'string',
            'transaction_date' => 'date:Y-m-d',
            'deleted_at' => 'datetime',
        ];
    }
}
