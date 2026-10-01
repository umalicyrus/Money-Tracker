<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json([
            'message' => 'Account created successfully.',
            'user' => $user,
        ], 201)->header('Cache-Control', 'no-store, private');
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        if (! Auth::guard('web')->attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['The email or password is incorrect.'],
            ]);
        }

        $request->session()->regenerate();

        return response()->json([
            'message' => 'Logged in successfully.',
            'user' => Auth::guard('web')->user(),
        ])->header('Cache-Control', 'no-store, private');
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logged out successfully.',
        ])->header('Cache-Control', 'no-store, private');
    }
}
