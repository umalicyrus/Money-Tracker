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

    public function test_transaction_update_keeps_the_uuid_uses_the_current_version_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $create = $this->operation($walletId, $categoryId);
        $this->postOperation($user, $create)->assertOk();
        $update = $create;
        $update['operation_id'] = (string) Str::uuid();
        $update['action'] = 'update';
        $update['base_version'] = '1';
        $update['payload']['amount_minor'] = '4500';
        $update['payload']['note'] = 'Edited lunch';

        $first = $this->postOperation($user, $update)->assertOk()->json();
        $second = $this->postOperation($user, $update)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('transactions', ['id' => $create['entity_id'], 'user_id' => $user->id, 'version' => 2, 'amount_minor' => '4500', 'note' => 'Edited lunch']);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('sync_operations', 2);
    }

    public function test_another_user_cannot_update_a_transaction(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $create = $this->operation($walletId, $categoryId);
        $this->postOperation($user, $create)->assertOk();
        $update = $create;
        $update['operation_id'] = (string) Str::uuid();
        $update['action'] = 'update';
        $update['base_version'] = '1';

        $this->actingAs($otherUser, 'sanctum')->withHeaders(['X-Expected-User-ID' => $otherUser->id, 'X-Sync-Protocol' => '1'])
            ->postJson('/api/v1/sync/operations', $update)->assertConflict()->assertJsonPath('error.code', 'REFERENCE_UNAVAILABLE');
        $this->assertDatabaseHas('transactions', ['id' => $create['entity_id'], 'user_id' => $user->id, 'version' => 1]);
    }

    public function test_transaction_delete_creates_one_idempotent_tombstone(): void
    {
        $user = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $create = $this->operation($walletId, $categoryId);
        $this->postOperation($user, $create)->assertOk();
        $delete = $create;
        $delete['operation_id'] = (string) Str::uuid();
        $delete['action'] = 'delete';
        $delete['base_version'] = '1';

        $first = $this->postOperation($user, $delete)->assertOk()->json();
        $second = $this->postOperation($user, $delete)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertNotNull($first['data']['record']['deleted_at']);
        $this->assertDatabaseHas('transactions', ['id' => $create['entity_id'], 'user_id' => $user->id, 'version' => 2]);
        $this->assertNotNull(\DB::table('transactions')->where('id', $create['entity_id'])->value('deleted_at'));
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('sync_operations', 2);
        $this->assertDatabaseCount('sync_changes', 2);
        $this->assertDatabaseHas('sync_changes', ['entity_id' => $create['entity_id'], 'entity_version' => 2, 'action' => 'delete', 'operation_id' => $delete['operation_id']]);
    }

    public function test_transaction_delete_rejects_another_user_and_a_stale_version(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        [$walletId, $categoryId] = $this->createReferences($user);
        $create = $this->operation($walletId, $categoryId);
        $this->postOperation($user, $create)->assertOk();
        $delete = $create;
        $delete['operation_id'] = (string) Str::uuid();
        $delete['action'] = 'delete';
        $delete['base_version'] = '1';

        $this->postOperation($otherUser, $delete)->assertConflict()->assertJsonPath('error.code', 'REFERENCE_UNAVAILABLE');
        $delete['operation_id'] = (string) Str::uuid();
        $delete['base_version'] = '9';
        $this->postOperation($user, $delete)->assertConflict()->assertJsonPath('error.code', 'VERSION_CONFLICT');

        $this->assertNull(\DB::table('transactions')->where('id', $create['entity_id'])->value('deleted_at'));
        $this->assertDatabaseHas('transactions', ['id' => $create['entity_id'], 'version' => 1]);
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
