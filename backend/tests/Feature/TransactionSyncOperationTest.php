<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TransactionSyncOperationTest extends TestCase
{
    use RefreshDatabase;

    public function test_expense_creation_is_atomic_and_idempotent(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $operation = $this->operation($walletId, $categoryId);

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('transactions', ['id' => $operation['entity_id'], 'user_id' => $user->id, 'amount_minor' => '2550', 'type' => 'expense']);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('sync_operations', 1);
        $this->assertDatabaseCount('sync_changes', 1);
    }

    public function test_expense_requires_owned_references(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $operation = $this->operation($walletId, $categoryId);
        $operation['payload']['category_id'] = (string) Str::uuid();

        $this->postOperation($user, $operation)->assertConflict()->assertJsonPath('error.code', 'REFERENCE_UNAVAILABLE');
        $this->actingAs($user, 'sanctum')->withHeaders(['X-Expected-User-ID' => $otherUser->id, 'X-Sync-Protocol' => '1'])->postJson('/api/v1/sync/operations', $this->operation($walletId, $categoryId))->assertForbidden();
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_zero_amount_is_rejected_without_writes(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $operation = $this->operation($walletId, $categoryId);
        $operation['payload']['amount_minor'] = '0';

        $this->postOperation($user, $operation)->assertUnprocessable();
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_income_creation_requires_income_category_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user, 'income');
        $operation = $this->operation($walletId, $categoryId, 'income');

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('transactions', ['id' => $operation['entity_id'], 'type' => 'income', 'amount_minor' => '2550']);
        $this->assertDatabaseCount('transactions', 1);
    }

    /** @return array{0: string, 1: string} */
    private function createReferences(User $user, string $categoryType = 'expense'): array
    {
        $walletId = (string) Str::uuid();
        $categoryId = (string) Str::uuid();
        \DB::table('wallets')->insert(['id' => $walletId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Cash', 'name_key' => 'cash', 'type' => 'cash', 'currency' => 'PHP', 'opening_balance_minor' => 10000, 'opening_date' => now()->toDateString(), 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()]);
        \DB::table('categories')->insert(['id' => $categoryId, 'user_id' => $user->id, 'version' => 1, 'name' => $categoryType === 'income' ? 'Salary' : 'Food', 'name_key' => $categoryType, 'type' => $categoryType, 'icon' => 'tag', 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()]);

        return [$walletId, $categoryId];
    }

    private function operation(string $walletId, string $categoryId, string $type = 'expense'): array
    {
        return ['operation_id' => (string) Str::uuid(), 'device_id' => (string) Str::uuid(), 'entity_type' => 'transactions', 'entity_id' => (string) Str::uuid(), 'action' => 'create', 'base_version' => '0', 'payload' => ['type' => $type, 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => '2550', 'transaction_date' => now()->toDateString(), 'note' => $type === 'income' ? 'Salary' : 'Lunch']];
    }

    private function postOperation(User $user, array $operation): TestResponse
    {
        return $this->actingAs($user, 'sanctum')->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])->postJson('/api/v1/sync/operations', $operation);
    }
}
