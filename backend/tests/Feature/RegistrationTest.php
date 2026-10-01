<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_allows_a_null_legacy_id_and_preserves_the_existing_demo_users_legacy_id(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('legacy_id')->nullable()->unique();
        });

        $demoUser = User::factory()->create(['email' => 'demo@example.com']);
        DB::table('users')->where('id', $demoUser->id)->update(['legacy_id' => 42]);
        $this->withSession(['existing_session_value' => 'preserved']);
        $previousSessionId = session()->getId();

        $response = $this->postJson('/register', [
            ...$this->registrationData(),
            'id' => $demoUser->getKey(),
            'email_verified_at' => now()->toIso8601String(),
            'phone' => '555-0100',
        ])->assertCreated()
            ->assertJsonPath('message', 'Account created successfully.')
            ->assertJsonMissingPath('user.password')
            ->assertHeader('Cache-Control', 'no-store, private');

        $user = User::query()->where('email', 'new@example.com')->sole();
        $this->assertTrue(Str::isUuid($user->getKey()));
        $this->assertNotSame($demoUser->getKey(), $user->getKey());
        $response->assertJsonPath('user.id', $user->getKey());
        $this->assertSame('New Person', $user->name);
        $this->assertNull($user->legacy_id);
        $this->assertSame(42, $demoUser->fresh()->legacy_id);
        $this->assertTrue(Hash::check('new-password', $user->password));
        $this->assertNotSame('new-password', $user->password);
        $this->assertNull($user->email_verified_at);
        $this->assertNull($user->phone);
        $this->assertNull($user->profile_photo_path);
        $this->assertNotSame($previousSessionId, session()->getId());
        $this->assertAuthenticatedAs($user, 'web');
        $this->assertDatabaseCount('users', 2);
    }

    public function test_registration_session_can_be_verified_and_the_new_user_can_log_out_and_back_in(): void
    {
        $response = $this->postJson('/register', $this->registrationData())->assertCreated();
        $userId = $response->json('user.id');
        Auth::forgetGuards();

        $this->getJson('/api/user')->assertOk()
            ->assertJsonPath('id', $userId)
            ->assertJsonPath('email', 'new@example.com')
            ->assertHeader('Cache-Control', 'no-store, private');

        $this->postJson('/logout')->assertOk();
        $this->assertGuest('web');
        Auth::forgetGuards();
        $this->getJson('/api/user')->assertUnauthorized();

        $this->postJson('/login', ['email' => 'new@example.com', 'password' => 'new-password'])
            ->assertOk()->assertJsonPath('user.id', $userId);
        Auth::forgetGuards();
        $this->getJson('/api/user')->assertOk()->assertJsonPath('id', $userId);
    }

    public function test_duplicate_email_does_not_change_the_existing_account_or_authenticate(): void
    {
        $existingUser = User::factory()->create(['email' => 'new@example.com', 'name' => 'Existing person']);
        $existingPassword = $existingUser->password;

        $this->postJson('/register', $this->registrationData())
            ->assertUnprocessable()->assertJsonValidationErrors(['email']);

        $this->assertDatabaseCount('users', 1);
        $this->assertSame('Existing person', $existingUser->fresh()->name);
        $this->assertSame($existingPassword, $existingUser->fresh()->password);
        $this->assertGuest('web');
    }

    public function test_password_confirmation_is_required_to_match(): void
    {
        $this->postJson('/register', [
            ...$this->registrationData(),
            'password_confirmation' => 'different-password',
        ])->assertUnprocessable()->assertJsonValidationErrors(['password']);

        $this->assertDatabaseCount('users', 0);
        $this->assertGuest('web');
    }

    public function test_registration_validates_name_email_and_the_existing_eight_character_password_policy(): void
    {
        $this->postJson('/register', [
            'name' => '',
            'email' => 'invalid-email',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email', 'password']);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_registration_requires_csrf_protection_outside_the_test_environment(): void
    {
        $this->app['env'] = 'local';

        $this->postJson('/register', $this->registrationData())->assertStatus(419);

        $this->assertDatabaseCount('users', 0);
        $this->assertGuest('web');
    }

    public function test_registration_is_rate_limited(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/register', [])->assertUnprocessable();
        }

        $this->postJson('/register', $this->registrationData())
            ->assertTooManyRequests()->assertHeader('Retry-After');

        $this->assertDatabaseCount('users', 0);
    }

    public function test_registration_supports_the_configured_credentialed_cors_origin(): void
    {
        config(['cors.allowed_origins' => ['https://money-tracker.vercel.app']]);

        $this->withHeaders([
            'Origin' => 'https://money-tracker.vercel.app',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'x-xsrf-token,content-type',
        ])->options('/register')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'https://money-tracker.vercel.app')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_successful_registration_does_not_reset_the_ip_rate_limit_when_the_session_user_changes(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/register', [
                ...$this->registrationData(),
                'email' => 'person'.$attempt.'@example.com',
            ])->assertCreated();
        }

        $this->postJson('/register', $this->registrationData())->assertTooManyRequests();

        $this->assertDatabaseCount('users', 5);
    }

    public function test_new_registration_has_an_empty_workspace_and_cannot_download_another_users_financial_records(): void
    {
        $existingUser = User::factory()->create();
        $walletId = (string) Str::uuid();
        $categoryId = (string) Str::uuid();
        $transactionId = (string) Str::uuid();
        $budgetId = (string) Str::uuid();

        DB::table('wallets')->insert([
            'id' => $walletId, 'user_id' => $existingUser->id, 'version' => 1, 'name' => 'Private cash', 'name_key' => 'private cash', 'type' => 'cash', 'currency' => 'PHP', 'opening_balance_minor' => 10000, 'opening_date' => now()->toDateString(), 'is_archived' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('categories')->insert([
            'id' => $categoryId, 'user_id' => $existingUser->id, 'version' => 1, 'name' => 'Food', 'name_key' => 'food', 'type' => 'expense', 'icon' => 'food', 'is_archived' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('transactions')->insert([
            'id' => $transactionId, 'user_id' => $existingUser->id, 'version' => 1, 'type' => 'expense', 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => 2550, 'transaction_date' => now()->toDateString(), 'note' => 'Lunch', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('budgets')->insert([
            'id' => $budgetId, 'user_id' => $existingUser->id, 'version' => 1, 'category_id' => $categoryId, 'limit_minor' => 50000, 'month_start' => now()->startOfMonth()->toDateString(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->postJson('/register', $this->registrationData())->assertCreated();
        $userId = $response->json('user.id');
        Auth::forgetGuards();

        $this->withHeaders(['X-Expected-User-ID' => $userId, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')->assertOk()
            ->assertJsonPath('data.user_id', $userId)
            ->assertJsonCount(0, 'data.wallets')
            ->assertJsonCount(0, 'data.categories')
            ->assertJsonCount(0, 'data.transactions')
            ->assertJsonCount(0, 'data.budgets');

        $this->withHeaders(['X-Expected-User-ID' => $existingUser->id, 'X-Sync-Protocol' => '1'])
            ->getJson('/api/v1/sync/records')->assertForbidden()
            ->assertJsonPath('error.code', 'ACCOUNT_MISMATCH');

        $this->assertDatabaseHas('wallets', ['id' => $walletId, 'user_id' => $existingUser->id, 'opening_balance_minor' => 10000]);
        $this->assertDatabaseHas('categories', ['id' => $categoryId, 'user_id' => $existingUser->id, 'name' => 'Food']);
        $this->assertDatabaseHas('transactions', ['id' => $transactionId, 'user_id' => $existingUser->id, 'amount_minor' => 2550]);
        $this->assertDatabaseHas('budgets', ['id' => $budgetId, 'user_id' => $existingUser->id, 'limit_minor' => 50000]);
    }

    /** @return array{name: string, email: string, password: string, password_confirmation: string} */
    private function registrationData(): array
    {
        return [
            'name' => 'New Person',
            'email' => 'new@example.com',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ];
    }
}
