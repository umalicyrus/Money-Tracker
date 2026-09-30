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
