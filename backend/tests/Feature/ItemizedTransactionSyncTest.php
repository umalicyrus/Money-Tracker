<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class ItemizedTransactionSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_itemized_expense_is_downloaded_and_retry_is_idempotent(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->references($user);
        $operation = [
            'operation_id' => (string) Str::uuid(), 'device_id' => (string) Str::uuid(), 'entity_type' => 'transactions', 'entity_id' => (string) Str::uuid(), 'action' => 'create', 'base_version' => '0',
            'payload' => ['type' => 'expense', 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => '141000', 'transaction_date' => '2026-07-10', 'note' => 'Market run', 'items' => [
                ['name' => 'Rice', 'quantity' => 2, 'unit_price_minor' => '45000'], ['name' => 'Fruit', 'quantity' => 3, 'unit_price_minor' => '17000'],
            ]],
        ];

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('transactions', ['id' => $operation['entity_id'], 'amount_minor' => '141000']);
        $this->actingAs($user, 'sanctum')->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')->assertOk()->assertJsonPath('data.transactions.0.items.0.name', 'Rice')->assertJsonPath('data.transactions.0.items.1.unit_price_minor', '17000');
    }

    public function test_item_totals_must_match_the_transaction_total(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->references($user);
        $this->postOperation($user, ['operation_id' => (string) Str::uuid(), 'device_id' => (string) Str::uuid(), 'entity_type' => 'transactions', 'entity_id' => (string) Str::uuid(), 'action' => 'create', 'base_version' => '0', 'payload' => ['type' => 'expense', 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => '1', 'transaction_date' => '2026-07-10', 'items' => [['name' => 'Rice', 'quantity' => 2, 'unit_price_minor' => '45000']]]])->assertUnprocessable();
    }

    public function test_existing_transaction_without_items_downloads_without_invented_details(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->references($user);
        $transactionId = (string) Str::uuid();

        DB::table('transactions')->insert([
            'id' => $transactionId,
            'user_id' => $user->id,
            'version' => 1,
            'type' => 'expense',
            'wallet_id' => $walletId,
            'category_id' => $categoryId,
            'amount_minor' => 5000,
            'transaction_date' => '2026-07-10',
            'note' => 'Existing expense',
            'items' => null,
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => null,
        ]);

        $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')
            ->assertOk()
            ->assertJsonPath('data.transactions.0.id', $transactionId)
            ->assertJsonPath('data.transactions.0.items', null);
    }

    /** @return array{0: string, 1: string} */
    private function references(User $user): array
    {
        $walletId = (string) Str::uuid();
        $categoryId = (string) Str::uuid();
        DB::table('wallets')->insert(['id' => $walletId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Cash', 'name_key' => 'cash', 'type' => 'cash', 'currency' => 'PHP', 'opening_balance_minor' => 0, 'opening_date' => '2026-07-01', 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('categories')->insert(['id' => $categoryId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Food', 'name_key' => 'food', 'type' => 'expense', 'icon' => 'tag', 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()]);

        return [$walletId, $categoryId];
    }

    /** @param array<string, mixed> $operation */
    private function postOperation(User $user, array $operation): TestResponse
    {
        return $this->actingAs($user, 'sanctum')->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])->postJson('/api/v1/sync/operations', $operation);
    }
}
