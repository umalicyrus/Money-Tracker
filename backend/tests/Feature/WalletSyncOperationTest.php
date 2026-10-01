<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class WalletSyncOperationTest extends TestCase
{
    use RefreshDatabase;

    public function test_wallet_creation_commits_record_receipt_change_and_sequence(): void
    {
        $user = User::factory()->create();
        $operation = $this->operation();

        $response = $this->postOperation($user, $operation);

        $response->assertOk()
            ->assertJsonPath('data.user_id', $user->id)
            ->assertJsonPath('data.entity_id', $operation['entity_id'])
            ->assertJsonPath('data.version', '1')
            ->assertJsonPath('data.sequence', '1')
            ->assertJsonPath('data.record.opening_balance_minor', '150075');

        $this->assertDatabaseHas('wallets', [
            'id' => $operation['entity_id'],
            'user_id' => $user->id,
            'opening_balance_minor' => '150075',
        ]);
        $this->assertDatabaseHas('sync_operations', [
            'user_id' => $user->id,
            'operation_id' => $operation['operation_id'],
        ]);
        $this->assertDatabaseHas('sync_changes', [
            'user_id' => $user->id,
            'sequence' => 1,
            'entity_id' => $operation['entity_id'],
        ]);
        $this->assertDatabaseHas('sync_heads', [
            'user_id' => $user->id,
            'last_sequence' => 1,
        ]);
    }

    public function test_invalid_wallet_payload_is_rejected_without_writes(): void
    {
        $user = User::factory()->create();
        $operation = $this->operation();
        $operation['payload']['opening_balance_minor'] = 1.5;

        $this->postOperation($user, $operation)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payload.opening_balance_minor');

        $this->assertDatabaseCount('wallets', 0);
        $this->assertDatabaseCount('sync_operations', 0);
        $this->assertDatabaseCount('sync_changes', 0);
    }

    public function test_operation_is_bound_to_the_authenticated_user(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $operation = $this->operation();

        $this->actingAs($user, 'sanctum')
            ->withHeaders([
                'X-Expected-User-ID' => $otherUser->id,
                'X-Sync-Protocol' => '1',
            ])
            ->postJson('/api/v1/sync/operations', $operation)
            ->assertForbidden()
            ->assertJsonPath('error.code', 'ACCOUNT_MISMATCH');

        $this->assertDatabaseCount('wallets', 0);
    }

    public function test_identical_retry_returns_the_original_receipt_without_duplicates(): void
    {
        $user = User::factory()->create();
        $operation = $this->operation();

        $first = $this->postOperation($user, $operation)->json();
        $second = $this->postOperation($user, $operation)->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseCount('wallets', 1);
        $this->assertDatabaseCount('sync_operations', 1);
        $this->assertDatabaseCount('sync_changes', 1);
    }

    public function test_reusing_an_operation_id_with_different_content_fails(): void
    {
        $user = User::factory()->create();
        $operation = $this->operation();
        $this->postOperation($user, $operation)->assertOk();
        $operation['payload']['name'] = 'Different wallet';

        $this->postOperation($user, $operation)
            ->assertConflict()
            ->assertJsonPath('error.code', 'OPERATION_ID_REUSED');

        $this->assertDatabaseCount('wallets', 1);
        $this->assertDatabaseCount('sync_operations', 1);
        $this->assertDatabaseCount('sync_changes', 1);
    }

    public function test_duplicate_name_leaves_no_partial_sync_write(): void
    {
        $user = User::factory()->create();
        $first = $this->operation();
        $second = $this->operation();
        $second['payload']['name'] = $first['payload']['name'];

        $this->postOperation($user, $first)->assertOk();
        $this->postOperation($user, $second)
            ->assertConflict()
            ->assertJsonPath('error.code', 'DUPLICATE_NAME');

        $this->assertDatabaseCount('wallets', 1);
        $this->assertDatabaseCount('sync_operations', 1);
        $this->assertDatabaseCount('sync_changes', 1);
        $this->assertDatabaseHas('sync_heads', [
            'user_id' => $user->id,
            'last_sequence' => 1,
        ]);
    }

    public function test_wallet_update_keeps_the_uuid_uses_the_current_version_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        $create = $this->operation();
        $this->postOperation($user, $create)->assertOk();
        $update = $create;
        $update['operation_id'] = (string) Str::uuid();
        $update['action'] = 'update';
        $update['base_version'] = '1';
        $update['payload']['name'] = 'Edited Cash';
        $update['payload']['opening_balance_minor'] = '250000';

        $first = $this->postOperation($user, $update)->assertOk()->json();
        $second = $this->postOperation($user, $update)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('wallets', ['id' => $create['entity_id'], 'user_id' => $user->id, 'version' => 2, 'name' => 'Edited Cash', 'opening_balance_minor' => '250000']);
        $this->assertDatabaseCount('wallets', 1);
        $this->assertDatabaseCount('sync_operations', 2);
    }

    public function test_wallet_update_rejects_a_stale_version_without_changing_the_wallet(): void
    {
        $user = User::factory()->create();
        $create = $this->operation();
        $this->postOperation($user, $create)->assertOk();
        $update = $create;
        $update['operation_id'] = (string) Str::uuid();
        $update['action'] = 'update';
        $update['base_version'] = '9';

        $this->postOperation($user, $update)->assertConflict()->assertJsonPath('error.code', 'VERSION_CONFLICT');
        $this->assertDatabaseHas('wallets', ['id' => $create['entity_id'], 'version' => 1, 'name' => 'Main Cash']);
    }

    public function test_wallet_archive_is_idempotent_and_preserves_historical_transactions(): void
    {
        $user = User::factory()->create();
        $create = $this->operation();
        $this->postOperation($user, $create)->assertOk();
        $categoryId = (string) Str::uuid();
        $transactionId = (string) Str::uuid();
        \DB::table('categories')->insert(['id' => $categoryId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Food', 'name_key' => 'food', 'type' => 'expense', 'icon' => 'food', 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()]);
        \DB::table('transactions')->insert(['id' => $transactionId, 'user_id' => $user->id, 'version' => 1, 'type' => 'expense', 'wallet_id' => $create['entity_id'], 'category_id' => $categoryId, 'amount_minor' => 2500, 'transaction_date' => now()->toDateString(), 'created_at' => now(), 'updated_at' => now()]);
        $archive = $create;
        $archive['operation_id'] = (string) Str::uuid();
        $archive['action'] = 'delete';
        $archive['base_version'] = '1';

        $first = $this->postOperation($user, $archive)->assertOk()->json();
        $second = $this->postOperation($user, $archive)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertTrue($first['data']['record']['is_archived']);
        $this->assertDatabaseHas('wallets', ['id' => $create['entity_id'], 'user_id' => $user->id, 'version' => 2, 'is_archived' => true]);
        $this->assertDatabaseHas('transactions', ['id' => $transactionId, 'wallet_id' => $create['entity_id'], 'deleted_at' => null]);
        $this->assertDatabaseCount('wallets', 1);
        $this->assertDatabaseCount('transactions', 1);
        $this->assertDatabaseCount('sync_operations', 2);
        $this->assertDatabaseCount('sync_changes', 2);
    }

    public function test_another_user_cannot_archive_a_wallet(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $create = $this->operation();
        $this->postOperation($user, $create)->assertOk();
        $archive = $create;
        $archive['operation_id'] = (string) Str::uuid();
        $archive['action'] = 'delete';
        $archive['base_version'] = '1';

        $this->postOperation($otherUser, $archive)->assertConflict()->assertJsonPath('error.code', 'REFERENCE_UNAVAILABLE');
        $this->assertDatabaseHas('wallets', ['id' => $create['entity_id'], 'user_id' => $user->id, 'version' => 1, 'is_archived' => false]);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function postOperation(User $user, array $operation): TestResponse
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeaders([
                'X-Expected-User-ID' => $user->id,
                'X-Sync-Protocol' => '1',
            ])
            ->postJson('/api/v1/sync/operations', $operation);
    }

    /**
     * @return array<string, mixed>
     */
    private function operation(): array
    {
        return [
            'operation_id' => (string) Str::uuid(),
            'device_id' => (string) Str::uuid(),
            'entity_type' => 'wallets',
            'entity_id' => (string) Str::uuid(),
            'action' => 'create',
            'base_version' => '0',
            'payload' => [
                'name' => 'Main Cash',
                'type' => 'cash',
                'opening_balance_minor' => '150075',
                'currency' => 'PHP',
                'opening_date' => now()->toDateString(),
            ],
        ];
    }
}
