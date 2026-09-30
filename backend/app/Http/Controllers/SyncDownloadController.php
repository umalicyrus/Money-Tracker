<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SyncDownloadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($request->header('X-Expected-User-ID') !== $user->getKey()) {
            return $this->errorResponse('ACCOUNT_MISMATCH', 'The sync account does not match the authenticated account.', 403);
        }

        if ($request->header('X-Sync-Protocol') !== '1') {
            return $this->errorResponse('CLIENT_UPGRADE_REQUIRED', 'This client must use sync protocol 1.', 426);
        }

        $userId = $user->getKey();

        return response()->json([
            'data' => [
                'user_id' => $userId,
                'wallets' => DB::table('wallets')->where('user_id', $userId)->orderBy('id')->get()->map(fn (object $wallet): array => [
                    'id' => (string) $wallet->id, 'user_id' => (string) $wallet->user_id, 'version' => (string) $wallet->version, 'name' => $wallet->name, 'type' => $wallet->type, 'currency' => $wallet->currency, 'opening_balance_minor' => (string) $wallet->opening_balance_minor, 'opening_date' => $wallet->opening_date, 'is_archived' => (bool) $wallet->is_archived, 'deleted_at' => $wallet->deleted_at,
                ])->values(),
                'categories' => DB::table('categories')->where('user_id', $userId)->orderBy('id')->get()->map(fn (object $category): array => [
                    'id' => (string) $category->id, 'user_id' => (string) $category->user_id, 'version' => (string) $category->version, 'name' => $category->name, 'description' => property_exists($category, 'description') ? $category->description : null, 'type' => $category->type, 'icon' => $category->icon, 'icon_image' => property_exists($category, 'icon_image') ? $category->icon_image : null, 'is_archived' => (bool) $category->is_archived,
                ])->values(),
                'transactions' => DB::table('transactions')->where('user_id', $userId)->orderBy('transaction_date')->orderBy('id')->get()->map(fn (object $transaction): array => [
                    'id' => (string) $transaction->id, 'user_id' => (string) $transaction->user_id, 'version' => (string) $transaction->version, 'type' => $transaction->type, 'wallet_id' => (string) $transaction->wallet_id, 'destination_wallet_id' => $transaction->destination_wallet_id === null ? null : (string) $transaction->destination_wallet_id, 'category_id' => $transaction->category_id === null ? null : (string) $transaction->category_id, 'amount_minor' => (string) $transaction->amount_minor, 'transaction_date' => $transaction->transaction_date, 'note' => $transaction->note, 'items' => $transaction->items === null ? null : json_decode($transaction->items, true, 512, JSON_THROW_ON_ERROR), 'deleted_at' => $transaction->deleted_at,
                ])->values(),
                'budgets' => DB::table('budgets')->where('user_id', $userId)->orderBy('month_start')->orderBy('id')->get()->map(fn (object $budget): array => [
                    'id' => (string) $budget->id, 'user_id' => (string) $budget->user_id, 'version' => (string) $budget->version, 'category_id' => (string) $budget->category_id, 'limit_minor' => (string) $budget->limit_minor, 'month_start' => $budget->month_start, 'deleted_at' => $budget->deleted_at,
                ])->values(),
            ],
        ]);
    }

    private function errorResponse(string $code, string $message, int $status): JsonResponse
    {
        return response()->json(['error' => ['code' => $code, 'message' => $message, 'request_id' => (string) Str::uuid()]], $status);
    }
}
