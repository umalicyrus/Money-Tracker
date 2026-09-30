<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->trustHosts(
            at: function (): array {
                $appHost = parse_url((string) config('app.url'), PHP_URL_HOST);

                return array_values(array_filter([
                    is_string($appHost) && $appHost !== '' ? '^'.preg_quote($appHost, '/').'$' : null,
                    '^.+\.up\.railway\.app$',
                    '^.+\.railway\.app$',
                    '^localhost$',
                    '^127\.0\.0\.1$',
                ]));
            },
            subdomains: false,
        );

        $middleware->redirectTo(
            fn (Request $request) => $request->expectsJson() || $request->is('api/*') ? null : route('login')
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
