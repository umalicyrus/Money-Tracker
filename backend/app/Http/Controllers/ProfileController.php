<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $this->profile($user)]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:30'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $user->name = trim($validated['name']);
        $user->phone = isset($validated['phone']) ? trim($validated['phone']) ?: null : null;
        $user->save();

        return response()->json(['data' => $this->profile($user)]);
    }

    public function storePhoto(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => ['required', File::image()->types(['jpeg', 'png', 'webp'])->max('2mb')],
        ]);

        /** @var User $user */
        $user = $request->user();
        $disk = Storage::disk('local');
        $oldPath = $user->profile_photo_path;
        $path = $request->file('photo')->store('profile-photos/'.$user->getKey(), 'local');

        $user->profile_photo_path = $path;
        $user->save();

        if ($oldPath !== null && $oldPath !== $path) {
            $disk->delete($oldPath);
        }

        return response()->json(['data' => $this->profile($user)]);
    }

    public function destroyPhoto(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->profile_photo_path !== null) {
            Storage::disk('local')->delete($user->profile_photo_path);
            $user->profile_photo_path = null;
            $user->save();
        }

        return response()->json(['data' => $this->profile($user)]);
    }

    public function photo(Request $request): BinaryFileResponse
    {
        /** @var User $user */
        $user = $request->user();
        $path = $user->profile_photo_path;

        abort_if($path === null || ! Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), [
            'Cache-Control' => 'private, no-store',
            'Content-Disposition' => 'inline',
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'current_password:web'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $user->password = Hash::make($validated['password']);
        $user->save();

        return response()->json(['message' => 'Password updated successfully.']);
    }

    /** @return array{id: string, name: string, phone: ?string, email: string, has_photo: bool, photo_url: ?string} */
    private function profile(User $user): array
    {
        return [
            'id' => $user->getKey(),
            'name' => $user->name,
            'phone' => $user->phone,
            'email' => $user->email,
            'has_photo' => $user->profile_photo_path !== null,
            'photo_url' => $user->profile_photo_path === null ? null : '/api/v1/profile/photo',
        ];
    }
}
