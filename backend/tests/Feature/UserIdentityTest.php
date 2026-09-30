<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Tests\TestCase;

class UserIdentityTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_the_configured_vercel_origin_is_stateful(): void
    {
        config(['sanctum.stateful' => ['money-tracker.vercel.app']]);

        $request = Request::create('https://backend.example/api/user');
        $request->headers->set('Origin', 'https://money-tracker.vercel.app');
        $this->assertTrue(EnsureFrontendRequestsAreStateful::fromFrontend($request));

        $request->headers->set('Origin', 'https://untrusted-preview.vercel.app');
        $this->assertFalse(EnsureFrontendRequestsAreStateful::fromFrontend($request));
    }

    public function test_proxy_csrf_cookie_has_no_backend_domain_and_is_secure(): void
    {
        config(['session.domain' => null, 'session.secure' => true, 'session.same_site' => 'lax']);

        $response = $this->getJson('/sanctum/csrf-cookie')->assertNoContent();
        $cookies = collect($response->headers->getCookies());
        $csrf = $cookies->first(fn ($cookie) => $cookie->getName() === 'XSRF-TOKEN');

        $this->assertNotNull($csrf);
        $this->assertContains($csrf->getDomain(), [null, '']);
        $this->assertTrue($csrf->isSecure());
        $this->assertFalse($csrf->isHttpOnly());
        $this->assertSame('lax', $csrf->getSameSite());
    }

    public function test_cors_allows_only_the_explicit_frontend_origin(): void
    {
        config(['cors.allowed_origins' => ['https://money-tracker.vercel.app']]);

        $this->withHeaders([
            'Origin' => 'https://money-tracker.vercel.app',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'x-xsrf-token,x-expected-user-id,x-sync-protocol,content-type',
        ])->options('/api/v1/sync/operations')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'https://money-tracker.vercel.app')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');

        $this->withHeaders(['Origin' => 'https://untrusted-preview.vercel.app'])
            ->options('/api/v1/sync/operations')
            ->assertHeader('Access-Control-Allow-Origin', 'https://money-tracker.vercel.app');
    }

    public function test_users_have_uuid_primary_keys(): void
    {
        $user = User::factory()->create();

        $this->assertTrue(Str::isUuid($user->getKey()));
        $this->assertSame('string', $user->getKeyType());
        $this->assertFalse($user->incrementing);
    }

    public function test_login_and_logout_use_uuid_session_identity(): void
    {
        $user = User::factory()->create([
            'email' => 'uuid@example.com',
            'password' => 'password',
        ]);

        $this->postJson('/login', [
            'email' => 'uuid@example.com',
            'password' => 'password',
        ])->assertOk();

        $this->assertAuthenticatedAs($user);

        $this->postJson('/logout')->assertOk();

        $this->assertGuest();
    }
}
