<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class BudgetSyncOperationTest extends TestCase
{
    use RefreshDatabase;

    public function test_budget_creation_retry_returns_the_original_receipt_without_duplicates(): void
    {
        $user = User::factory()->create();
        $categoryId = (string) Str::uuid();
        DB::table('categories')->insert([
            'id' => $categoryId,
            'user_id' => $user->id,
            'version' => 1,
            'name' => 'Food',
            'name_key' => 'food',
            'type' => 'expense',
            'icon' => 'tag',
            'is_archived' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $operation = [
            'operation_id' => (string) Str::uuid(),
            'device_id' => (string) Str::uuid(),
            'entity_type' => 'budgets',
            'entity_id' => (string) Str::uuid(),
            'action' => 'create',
            'base_version' => '0',
            'payload' => ['category_id' => $categoryId, 'limit_minor' => '500000', 'month_start' => '2026-09-01'],
        ];

        $first = $this->postOperation($user, $operation)->assertOk()->json();
        $second = $this->postOperation($user, $operation)->assertOk()->json();

        $this->assertSame($first, $second);
        $this->assertDatabaseHas('budgets', [
            'id' => $operation['entity_id'],
            'user_id' => $user->id,
            'category_id' => $categoryId,
            'limit_minor' => '500000',
            'month_start' => '2026-09-01',
        ]);
        $this->assertDatabaseCount('budgets', 1);
        $this->assertDatabaseCount('sync_operations', 1);
    }

    public function test_budget_requires_an_owned_expense_category(): void
    {
        $user = User::factory()->create();

        $this->postOperation($user, [
            'operation_id' => (string) Str::uuid(),
            'device_id' => (string) Str::uuid(),
            'entity_type' => 'budgets',
            'entity_id' => (string) Str::uuid(),
            'action' => 'create',
            'base_version' => '0',
            'payload' => ['category_id' => (string) Str::uuid(), 'limit_minor' => '500000', 'month_start' => '2026-09-01'],
        ])->assertConflict()->assertJsonPath('error.code', 'REFERENCE_UNAVAILABLE');
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function postOperation(User $user, array $operation): TestResponse
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->postJson('/api/v1/sync/operations', $operation);
    }
}
