<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class SyncDownloadTest extends TestCase
{
    use RefreshDatabase;

    public function test_download_returns_only_the_authenticated_users_records(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $walletId = (string) Str::uuid();
        $categoryId = (string) Str::uuid();
        $otherWalletId = (string) Str::uuid();

        $this->insertWallet($user->id, $walletId, 'Cash');
        $this->insertWallet($otherUser->id, $otherWalletId, 'Private cash');
        DB::table('categories')->insert([
            'id' => $categoryId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Food', 'name_key' => 'food', 'type' => 'expense', 'icon' => 'tag', 'is_archived' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('transactions')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $user->id, 'version' => 1, 'type' => 'expense', 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => 2550, 'transaction_date' => now()->toDateString(), 'note' => 'Lunch', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')
            ->assertOk()
            ->assertJsonPath('data.user_id', $user->id)
            ->assertJsonCount(1, 'data.wallets')
            ->assertJsonPath('data.wallets.0.id', $walletId)
            ->assertJsonCount(1, 'data.categories')
            ->assertJsonPath('data.categories.0.icon_image', null)
            ->assertJsonCount(1, 'data.transactions')
            ->assertJsonPath('data.transactions.0.deleted_at', null)
            ->assertJsonMissing(['id' => $otherWalletId]);
    }

    public function test_download_rejects_a_mismatched_account_header(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $otherUser->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'ACCOUNT_MISMATCH');
    }

    public function test_download_returns_a_custom_category_thumbnail_without_affecting_legacy_categories(): void
    {
        $user = User::factory()->create();
        $legacyId = (string) Str::uuid();
        $customId = (string) Str::uuid();
        $thumbnail = 'data:image/webp;base64,UklGRg==';

        DB::table('categories')->insert([
            ['id' => $legacyId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Food', 'name_key' => 'food', 'type' => 'expense', 'icon' => 'food', 'icon_image' => null, 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()],
            ['id' => $customId, 'user_id' => $user->id, 'version' => 1, 'name' => 'Transport', 'name_key' => 'transport', 'type' => 'expense', 'icon' => 'transport', 'icon_image' => $thumbnail, 'is_archived' => false, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($user, 'sanctum')->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')->assertOk()
            ->assertJsonFragment(['id' => $legacyId, 'icon_image' => null])
            ->assertJsonFragment(['id' => $customId, 'icon_image' => $thumbnail]);
    }

    private function insertWallet(string $userId, string $walletId, string $name): void
    {
        DB::table('wallets')->insert([
            'id' => $walletId, 'user_id' => $userId, 'version' => 1, 'name' => $name, 'name_key' => $name, 'type' => 'cash', 'currency' => 'PHP', 'opening_balance_minor' => 10000, 'opening_date' => now()->toDateString(), 'is_archived' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
