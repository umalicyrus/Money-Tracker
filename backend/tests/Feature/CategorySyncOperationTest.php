<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CategorySyncOperationTest extends TestCase
{
    use RefreshDatabase;

    public function test_income_category_creation_is_atomic_and_idempotent(): void
    {
        $user = User::factory()->create();
        $operation = $this->operation('Salary', 'income');
        $operation['payload']['description'] = 'Regular monthly income';

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('categories', [
            'id' => $operation['entity_id'],
            'user_id' => $user->id,
            'type' => 'income',
            'name' => 'Salary',
            'description' => 'Regular monthly income',
        ]);
        $this->assertSame('Regular monthly income', $first['data']['record']['description']);
        $this->assertDatabaseCount('categories', 1);
        $this->assertDatabaseCount('sync_operations', 1);
        $this->assertDatabaseCount('sync_changes', 1);
    }

    public function test_expense_category_is_private_to_authenticated_user(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->withHeaders([
                'X-Expected-User-ID' => $otherUser->id,
                'X-Sync-Protocol' => '1',
            ])
            ->postJson('/api/v1/sync/operations', $this->operation('Food', 'expense'))
            ->assertForbidden()
            ->assertJsonPath('error.code', 'ACCOUNT_MISMATCH');

        $this->assertDatabaseCount('categories', 0);
    }

    public function test_custom_image_category_creation_is_idempotent(): void
    {
        $user = User::factory()->create();
        $operation = $this->operation('Transport', 'expense');
        $operation['payload']['icon'] = 'transport';
        $operation['payload']['icon_image'] = 'data:image/webp;base64,UklGRg==';

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('categories', ['id' => $operation['entity_id'], 'icon_image' => $operation['payload']['icon_image']]);
        $this->assertDatabaseCount('categories', 1);
        $this->assertDatabaseCount('sync_operations', 1);
    }

    public function test_category_updates_are_idempotent_and_archiving_keeps_transaction_history(): void
    {
        $user = User::factory()->create();
        $walletId = (string) Str::uuid();
        DB::table('wallets')->insert([
            'id' => $walletId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Cash', 'name_key' => 'cash',
            'type' => 'cash', 'currency' => 'PHP', 'opening_balance_minor' => '0', 'opening_date' => '2026-09-01',
            'is_archived' => false, 'created_at' => now(), 'updated_at' => now(), 'deleted_at' => null,
        ]);
        $create = $this->operation('Food', 'expense');
        $this->postOperation($user, $create)->assertOk();
        DB::table('transactions')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $user->id, 'version' => 1, 'type' => 'expense',
            'wallet_id' => $walletId, 'category_id' => $create['entity_id'], 'amount_minor' => '1200',
            'transaction_date' => '2026-09-28', 'note' => null, 'items' => null, 'created_at' => now(), 'updated_at' => now(), 'deleted_at' => null,
        ]);

        $typeChange = $this->categoryOperation($create['entity_id'], 'update', '1', 'Salary', 'income');
        $this->postOperation($user, $typeChange)->assertConflict()->assertJsonPath('error.code', 'CATEGORY_TYPE_LOCKED');

        $archive = $this->categoryOperation($create['entity_id'], 'archive', '1', 'Food', 'expense');
        $first = $this->postOperation($user, $archive)->assertOk()->json();
        $second = $this->postOperation($user, $archive)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('categories', ['id' => $create['entity_id'], 'is_archived' => true, 'version' => 2]);
        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'category_id' => $create['entity_id']]);
        $this->assertDatabaseCount('sync_operations', 2);
    }

    /**
     * @return array<string, mixed>
     */
    private function operation(string $name, string $type): array
    {
        return [
            'operation_id' => (string) Str::uuid(),
            'device_id' => (string) Str::uuid(),
            'entity_type' => 'categories',
            'entity_id' => (string) Str::uuid(),
            'action' => 'create',
            'base_version' => '0',
            'payload' => [
                'name' => $name,
                'type' => $type,
                'icon' => 'tag',
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function categoryOperation(string $categoryId, string $action, string $baseVersion, string $name, string $type): array
    {
        return [
            'operation_id' => (string) Str::uuid(), 'device_id' => (string) Str::uuid(), 'entity_type' => 'categories',
            'entity_id' => $categoryId, 'action' => $action, 'base_version' => $baseVersion,
            'payload' => ['name' => $name, 'type' => $type, 'icon' => 'tag'],
        ];
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
}
