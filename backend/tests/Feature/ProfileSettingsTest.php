<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_endpoints_require_an_authenticated_user(): void
    {
        $this->getJson('/api/v1/profile')->assertUnauthorized();
        $this->patchJson('/api/v1/profile', ['name' => 'Unauthenticated'])->assertUnauthorized();
        $this->postJson('/api/v1/profile/photo')->assertUnauthorized();
        $this->putJson('/api/v1/profile/password')->assertUnauthorized();
    }

    public function test_signed_in_user_can_only_read_and_update_their_own_profile(): void
    {
        $user = User::factory()->create(['name' => 'Original', 'phone' => null]);
        $otherUser = User::factory()->create(['name' => 'Other person', 'phone' => '555-0100']);

        $this->actingAs($user)
            ->getJson('/api/v1/profile')
            ->assertOk()
            ->assertJsonPath('data.id', $user->getKey())
            ->assertJsonPath('data.name', 'Original')
            ->assertJsonMissing(['id' => $otherUser->getKey()]);

        $this->actingAs($user)
            ->patchJson('/api/v1/profile', ['name' => 'Updated name', 'phone' => '555-0199'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated name');

        $this->assertDatabaseHas('users', ['id' => $user->getKey(), 'name' => 'Updated name', 'phone' => '555-0199']);
        $this->assertDatabaseHas('users', ['id' => $otherUser->getKey(), 'name' => 'Other person', 'phone' => '555-0100']);
    }

    public function test_profile_details_and_password_are_validated(): void
    {
        $user = User::factory()->create(['password' => Hash::make('current-password')]);

        $this->actingAs($user)
            ->patchJson('/api/v1/profile', ['name' => '', 'phone' => str_repeat('1', 31)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'phone']);

        $this->actingAs($user)
            ->putJson('/api/v1/profile/password', [
                'current_password' => 'incorrect-password',
                'password' => 'new-password',
                'password_confirmation' => 'different-password',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['current_password', 'password']);

        $this->actingAs($user)
            ->putJson('/api/v1/profile/password', [
                'current_password' => 'current-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('new-password', $user->fresh()->password));
    }

    public function test_profile_photo_is_validated_stored_privately_and_only_served_to_its_owner(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/v1/profile/photo', ['photo' => UploadedFile::fake()->create('not-an-image.txt', 10, 'text/plain')])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        $this->actingAs($user)
            ->postJson('/api/v1/profile/photo', ['photo' => UploadedFile::fake()->create('large.png', 2049, 'image/png')])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        $this->actingAs($user)
            ->postJson('/api/v1/profile/photo', ['photo' => UploadedFile::fake()->image('profile.jpg')])
            ->assertOk()
            ->assertJsonPath('data.has_photo', true)
            ->assertJsonPath('data.photo_url', '/api/v1/profile/photo');

        $path = $user->fresh()->profile_photo_path;
        $this->assertNotNull($path);
        Storage::disk('local')->assertExists($path);

        $this->actingAs($otherUser)->get('/api/v1/profile/photo')->assertNotFound();
        $this->actingAs($user)->get('/api/v1/profile/photo')->assertOk();

        $this->actingAs($user)->deleteJson('/api/v1/profile/photo')->assertOk()->assertJsonPath('data.has_photo', false);
        Storage::disk('local')->assertMissing($path);
    }
}
