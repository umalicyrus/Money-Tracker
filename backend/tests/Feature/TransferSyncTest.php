<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TransferSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_transfer_is_downloaded_and_retry_is_idempotent(): void
    {
        $user = User::factory()->create();
        $sourceWalletId = $this->wallet($user, 'Cash');
        $destinationWalletId = $this->wallet($user, 'Bank');
        $operation = $this->operation($sourceWalletId, $destinationWalletId);

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('transactions', [
            'id' => $operation['entity_id'],
            'type' => 'transfer',
            'wallet_id' => $sourceWalletId,
            'destination_wallet_id' => $destinationWalletId,
            'category_id' => null,
            'amount_minor' => '125050',
        ]);
        $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')
            ->assertOk()
            ->assertJsonPath('data.transactions.0.type', 'transfer')
            ->assertJsonPath('data.transactions.0.destination_wallet_id', $destinationWalletId)
            ->assertJsonPath('data.transactions.0.category_id', null);
    }

    public function test_transfer_requires_different_active_wallets_owned_by_the_user(): void
    {
        $user = User::factory()->create();
        $walletId = $this->wallet($user, 'Cash');

        $this->postOperation($user, $this->operation($walletId, $walletId))->assertUnprocessable();

        $otherUserWalletId = $this->wallet(User::factory()->create(), 'Other cash');
        $this->postOperation($user, $this->operation($walletId, $otherUserWalletId))
            ->assertConflict()
            ->assertJsonPath('error.code', 'REFERENCE_UNAVAILABLE');
    }

    /** @return array<string, mixed> */
    private function operation(string $sourceWalletId, string $destinationWalletId): array
    {
        return [
            'operation_id' => (string) Str::uuid(),
            'device_id' => (string) Str::uuid(),
            'entity_type' => 'transactions',
            'entity_id' => (string) Str::uuid(),
            'action' => 'create',
            'base_version' => '0',
            'payload' => [
                'type' => 'transfer',
                'wallet_id' => $sourceWalletId,
                'destination_wallet_id' => $destinationWalletId,
                'amount_minor' => '125050',
                'transaction_date' => '2026-09-25',
                'note' => 'Move to bank',
            ],
        ];
    }

    private function wallet(User $user, string $name): string
    {
        $walletId = (string) Str::uuid();
        DB::table('wallets')->insert([
            'id' => $walletId,
            'user_id' => $user->id,
            'version' => 1,
            'name' => $name,
            'name_key' => Str::lower($name),
            'type' => 'cash',
            'currency' => 'PHP',
            'opening_balance_minor' => 0,
            'opening_date' => '2026-09-01',
            'is_archived' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $walletId;
    }

    /** @param array<string, mixed> $operation */
    private function postOperation(User $user, array $operation): TestResponse
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->postJson('/api/v1/sync/operations', $operation);
    }
}
