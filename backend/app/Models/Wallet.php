<?php

namespace App\Models;

use Database\Factories\WalletFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'id',
    'user_id',
    'version',
    'name',
    'name_key',
    'type',
    'currency',
    'opening_balance_minor',
    'opening_date',
    'is_archived',
    'deleted_at',
])]
class Wallet extends Model
{
    /** @use HasFactory<WalletFactory> */
    use HasFactory, HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    public function getTable(): string
    {
        return 'wallets';
    }

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'opening_balance_minor' => 'string',
            'opening_date' => 'date:Y-m-d',
            'is_archived' => 'boolean',
            'deleted_at' => 'datetime',
        ];
    }
}
