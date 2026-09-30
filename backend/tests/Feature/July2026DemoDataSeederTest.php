<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\July2026DemoDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class July2026DemoDataSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_adds_july_review_data_once_for_the_demo_user(): void
    {
        $user = User::factory()->create(['email' => 'demo@example.com']);

        $this->seed(July2026DemoDataSeeder::class);
        $this->seed(July2026DemoDataSeeder::class);
        $this->artisan('money-tracker:seed-july-2026-demo-data')->assertSuccessful();

        $this->assertDatabaseCount('wallets', 2);
        $this->assertDatabaseCount('categories', 7);
        $this->assertDatabaseCount('transactions', 11);
        $this->assertDatabaseCount('budgets', 4);
        $this->assertDatabaseCount('sync_changes', 24);
        $this->assertDatabaseHas('sync_heads', ['user_id' => $user->id, 'last_sequence' => 24]);

        $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Expected-User-ID' => $user->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')
            ->assertOk()
            ->assertJsonCount(2, 'data.wallets')
            ->assertJsonCount(7, 'data.categories')
            ->assertJsonCount(11, 'data.transactions')
            ->assertJsonCount(4, 'data.budgets');
    }
}
