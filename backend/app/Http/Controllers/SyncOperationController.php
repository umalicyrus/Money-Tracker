<?php

namespace App\Http\Controllers;

use App\Http\Requests\SyncOperationRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class SyncOperationController extends Controller
{
    public function store(SyncOperationRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $expectedUserId = $request->header('X-Expected-User-ID');

        if ($expectedUserId !== $user->getKey()) {
            return $this->errorResponse('ACCOUNT_MISMATCH', 'The sync account does not match the authenticated account.', 403);
        }

        if ($request->header('X-Sync-Protocol') !== '1') {
            return $this->errorResponse('CLIENT_UPGRADE_REQUIRED', 'This client must use sync protocol 1.', 426);
        }

        $operation = $request->validated();
        $requestHash = $this->requestHash($user->getKey(), $operation);
        $payload = $operation['payload'];
        $name = isset($payload['name']) ? preg_replace('/\s+/u', ' ', trim($payload['name'])) : null;

        if (in_array($operation['entity_type'], ['wallets', 'categories'], true) && (! is_string($name) || $name === '' || mb_strlen($name) > 60)) {
            return $this->errorResponse('VALIDATION_FAILED', 'Please correct the highlighted fields.', 422, [
                'payload.name' => [sprintf('Enter a non-empty %s name of 60 characters or fewer.', $operation['entity_type'] === 'categories' ? 'category' : 'wallet')],
            ]);
        }

        $openingBalance = $payload['opening_balance_minor'] ?? '0';
        if ($openingBalance === '-0') {
            return $this->errorResponse('VALIDATION_FAILED', 'Please correct the highlighted fields.', 422, [
                'payload.opening_balance_minor' => ['Use 0 instead of -0.'],
            ]);
        }

        try {
            return DB::transaction(function () use ($operation, $requestHash, $user, $name, $openingBalance): JsonResponse {
                $now = now()->utc();
                $userId = $user->getKey();

                DB::table('sync_heads')->insertOrIgnore([
                    'user_id' => $userId,
                    'last_sequence' => 0,
                    'updated_at' => $now,
                ]);

                $head = DB::table('sync_heads')
                    ->where('user_id', $userId)
                    ->lockForUpdate()
                    ->first();

                $receipt = DB::table('sync_operations')
                    ->where('user_id', $userId)
                    ->where('operation_id', $operation['operation_id'])
                    ->first();

                if ($receipt !== null) {
                    if ($receipt->request_hash !== $requestHash) {
                        return $this->errorResponse('OPERATION_ID_REUSED', 'This operation ID was already used with different content.', 409);
                    }

                    return response()->json(json_decode($receipt->result, true, 512, JSON_THROW_ON_ERROR));
                }

                if ($operation['entity_type'] === 'transactions') {
                    if ($operation['action'] === 'delete') {
                        return $this->deleteTransaction($operation, $requestHash, $user->getKey(), $head, $now);
                    }

                    if ($operation['action'] === 'update') {
                        return $this->updateTransaction($operation, $requestHash, $user->getKey(), $head, $now);
                    }

                    if ($operation['action'] !== 'create') {
                        return $this->errorResponse('VALIDATION_FAILED', 'Transactions support create and update operations only.', 422);
                    }

                    return $this->createTransaction($operation, $requestHash, $user->getKey(), $head, $now);
                }

                if ($operation['entity_type'] === 'categories') {
                    if ($operation['action'] !== 'create') {
                        if (! in_array($operation['action'], ['update', 'archive'], true)) {
                            return $this->errorResponse('VALIDATION_FAILED', 'Categories support create, update, and archive operations only.', 422);
                        }

                        return $this->updateCategory($operation, $requestHash, $user->getKey(), $head, $name, $now);
                    }

                    return $this->createCategory($operation, $requestHash, $user->getKey(), $head, $name, $now);
                }

                if ($operation['entity_type'] === 'budgets') {
                    if ($operation['action'] !== 'create') {
                        return $this->errorResponse('VALIDATION_FAILED', 'Budgets support create operations only.', 422);
                    }

                    return $this->createBudget($operation, $requestHash, $user->getKey(), $head, $now);
                }

                if (! in_array($operation['payload']['type'], ['cash', 'bank', 'ewallet'], true)) {
                    return $this->errorResponse('VALIDATION_FAILED', 'Please correct the highlighted fields.', 422, [
                        'payload.type' => ['Choose cash, bank, or ewallet for a wallet.'],
                    ]);
                }

                if ($operation['action'] === 'update') {
                    return $this->updateWallet($operation, $requestHash, $user->getKey(), $head, $name, $openingBalance, $now);
                }

                if ($operation['action'] === 'delete') {
                    return $this->archiveWallet($operation, $requestHash, $user->getKey(), $head, $now);
                }

                if ($operation['action'] !== 'create') {
                    return $this->errorResponse('VALIDATION_FAILED', 'Wallets support create and update operations only.', 422);
                }

                $nameKey = mb_strtolower($name, 'UTF-8');
                if (DB::table('wallets')->where('id', $operation['entity_id'])->exists()) {
                    return $this->errorResponse('ENTITY_ID_IN_USE', 'This wallet ID is already in use.', 409);
                }

                if (DB::table('wallets')
                    ->where('user_id', $userId)
                    ->where('name_key', $nameKey)
                    ->exists()) {
                    return $this->errorResponse('DUPLICATE_NAME', 'A wallet with this name already exists.', 409);
                }

                $sequence = (int) $head->last_sequence + 1;
                $walletVersion = 1;
                $wallet = [
                    'id' => $operation['entity_id'],
                    'user_id' => $userId,
                    'version' => $walletVersion,
                    'name' => $name,
                    'name_key' => $nameKey,
                    'type' => $operation['payload']['type'],
                    'currency' => $operation['payload']['currency'] ?? 'PHP',
                    'opening_balance_minor' => $openingBalance,
                    'opening_date' => $operation['payload']['opening_date'],
                    'is_archived' => false,
                    'created_at' => $now,
                    'updated_at' => $now,
                    'deleted_at' => null,
                ];

                DB::table('wallets')->insert($wallet);

                $record = $this->walletRecord($wallet);
                $result = [
                    'data' => [
                        'user_id' => (string) $userId,
                        'operation_id' => $operation['operation_id'],
                        'entity_type' => 'wallets',
                        'entity_id' => $operation['entity_id'],
                        'version' => (string) $walletVersion,
                        'sequence' => (string) $sequence,
                        'record' => $record,
                    ],
                ];

                DB::table('sync_changes')->insert([
                    'user_id' => $userId,
                    'sequence' => $sequence,
                    'entity_type' => 'wallets',
                    'entity_id' => $operation['entity_id'],
                    'entity_version' => $walletVersion,
                    'action' => 'upsert',
                    'payload' => json_encode($record, JSON_THROW_ON_ERROR),
                    'operation_id' => $operation['operation_id'],
                    'created_at' => $now,
                ]);

                DB::table('sync_operations')->insert([
                    'user_id' => $userId,
                    'operation_id' => $operation['operation_id'],
                    'device_id' => $operation['device_id'],
                    'entity_type' => 'wallets',
                    'entity_id' => $operation['entity_id'],
                    'request_hash' => $requestHash,
                    'result' => json_encode($result, JSON_THROW_ON_ERROR),
                    'applied_at' => $now,
                ]);

                DB::table('sync_heads')->where('user_id', $userId)->update([
                    'last_sequence' => $sequence,
                    'updated_at' => $now,
                ]);

                return response()->json($result);
            });
        } catch (Throwable $exception) {
            $requestId = (string) Str::uuid();
            Log::error('Sync operation failed.', [
                'request_id' => $requestId,
                'entity_type' => $operation['entity_type'],
                'operation_id' => $operation['operation_id'],
                'entity_id' => $operation['entity_id'],
                'exception' => $exception,
            ]);

            $entity = match ($operation['entity_type']) {
                'categories' => 'category',
                'transactions' => 'transaction',
                'budgets' => 'budget',
                default => 'wallet',
            };

            return $this->errorResponse('SERVER_ERROR', "The {$entity} could not be saved. Please retry with the same operation ID.", 500, [], $requestId);
        }
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function createTransaction(array $operation, string $requestHash, string $userId, object $head, \DateTimeInterface $now): JsonResponse
    {
        $payload = $operation['payload'];
        $items = $payload['items'] ?? null;
        if ($items !== null && $payload['type'] !== 'expense') {
            return $this->errorResponse('VALIDATION_FAILED', 'Only expenses may include item details.', 422);
        }
        if ($items !== null && $this->itemsTotal($items) !== $payload['amount_minor']) {
            return $this->errorResponse('VALIDATION_FAILED', 'Item totals must equal the expense total.', 422, [
                'payload.amount_minor' => ['Item totals must equal the expense total.'],
            ]);
        }
        $wallet = DB::table('wallets')
            ->where('user_id', $userId)
            ->where('id', $payload['wallet_id'])
            ->where('is_archived', false)
            ->whereNull('deleted_at')
            ->first();
        $destinationWallet = $payload['type'] === 'transfer'
            ? DB::table('wallets')
                ->where('user_id', $userId)
                ->where('id', $payload['destination_wallet_id'])
                ->where('is_archived', false)
                ->whereNull('deleted_at')
                ->first()
            : null;
        $category = $payload['type'] === 'transfer'
            ? null
            : DB::table('categories')
                ->where('user_id', $userId)
                ->where('id', $payload['category_id'])
                ->where('type', $payload['type'])
                ->where('is_archived', false)
                ->whereNull('deleted_at')
                ->first();

        if ($wallet === null || ($payload['type'] === 'transfer' && $destinationWallet === null) || ($payload['type'] !== 'transfer' && $category === null)) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'The selected wallet or category is unavailable.', 409);
        }

        if ($payload['type'] === 'transfer' && $payload['wallet_id'] === $payload['destination_wallet_id']) {
            return $this->errorResponse('VALIDATION_FAILED', 'Choose two different wallets for a transfer.', 422, [
                'payload.destination_wallet_id' => ['Choose a destination wallet different from the source wallet.'],
            ]);
        }

        if (DB::table('transactions')->where('id', $operation['entity_id'])->exists()) {
            return $this->errorResponse('ENTITY_ID_IN_USE', 'This transaction ID is already in use.', 409);
        }

        $sequence = (int) $head->last_sequence + 1;
        $version = 1;
        $transaction = [
            'id' => $operation['entity_id'],
            'user_id' => $userId,
            'version' => $version,
            'type' => $payload['type'],
            'wallet_id' => $payload['wallet_id'],
            'destination_wallet_id' => $payload['type'] === 'transfer' ? $payload['destination_wallet_id'] : null,
            'category_id' => $payload['type'] === 'transfer' ? null : $payload['category_id'],
            'amount_minor' => $payload['amount_minor'],
            'transaction_date' => $payload['transaction_date'],
            'note' => $payload['note'] ?? null,
            'items' => $items === null ? null : json_encode($items, JSON_THROW_ON_ERROR),
            'created_at' => $now,
            'updated_at' => $now,
            'deleted_at' => null,
        ];

        DB::table('transactions')->insert($transaction);
        $record = [
            'id' => (string) $transaction['id'],
            'user_id' => $userId,
            'version' => (string) $version,
            'type' => $transaction['type'],
            'wallet_id' => $transaction['wallet_id'],
            'destination_wallet_id' => $transaction['destination_wallet_id'],
            'category_id' => $transaction['category_id'],
            'amount_minor' => (string) $transaction['amount_minor'],
            'transaction_date' => $transaction['transaction_date'],
            'note' => $transaction['note'],
            'items' => $items,
            'created_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
            'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
            'deleted_at' => null,
        ];
        $result = ['data' => [
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'entity_type' => 'transactions',
            'entity_id' => $operation['entity_id'],
            'version' => (string) $version,
            'sequence' => (string) $sequence,
            'record' => $record,
        ]];
        DB::table('sync_changes')->insert([
            'user_id' => $userId,
            'sequence' => $sequence,
            'entity_type' => 'transactions',
            'entity_id' => $operation['entity_id'],
            'entity_version' => $version,
            'action' => 'upsert',
            'payload' => json_encode($record, JSON_THROW_ON_ERROR),
            'operation_id' => $operation['operation_id'],
            'created_at' => $now,
        ]);
        DB::table('sync_operations')->insert([
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'device_id' => $operation['device_id'],
            'entity_type' => 'transactions',
            'entity_id' => $operation['entity_id'],
            'request_hash' => $requestHash,
            'result' => json_encode($result, JSON_THROW_ON_ERROR),
            'applied_at' => $now,
        ]);
        DB::table('sync_heads')->where('user_id', $userId)->update([
            'last_sequence' => $sequence,
            'updated_at' => $now,
        ]);

        return response()->json($result);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function updateTransaction(array $operation, string $requestHash, string $userId, object $head, \DateTimeInterface $now): JsonResponse
    {
        $payload = $operation['payload'];
        $transaction = DB::table('transactions')->where('user_id', $userId)->where('id', $operation['entity_id'])->lockForUpdate()->first();
        if ($transaction === null || $transaction->deleted_at !== null) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'This transaction is unavailable.', 409);
        }
        if ((string) $transaction->version !== $operation['base_version']) {
            return $this->errorResponse('VERSION_CONFLICT', 'This record changed on another device. Review before retrying.', 409);
        }

        $items = $payload['items'] ?? null;
        if ($items !== null && $payload['type'] !== 'expense') {
            return $this->errorResponse('VALIDATION_FAILED', 'Only expenses may include item details.', 422);
        }
        if ($items !== null && $this->itemsTotal($items) !== $payload['amount_minor']) {
            return $this->errorResponse('VALIDATION_FAILED', 'Item totals must equal the expense total.', 422, [
                'payload.amount_minor' => ['Item totals must equal the expense total.'],
            ]);
        }
        if (! $this->transactionReferencesAreAvailable($payload, $userId)) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'The selected wallet or category is unavailable.', 409);
        }
        if ($payload['type'] === 'transfer' && $payload['wallet_id'] === $payload['destination_wallet_id']) {
            return $this->errorResponse('VALIDATION_FAILED', 'Choose two different wallets for a transfer.', 422, [
                'payload.destination_wallet_id' => ['Choose a destination wallet different from the source wallet.'],
            ]);
        }

        $version = (int) $transaction->version + 1;
        $updated = [
            'version' => $version,
            'type' => $payload['type'],
            'wallet_id' => $payload['wallet_id'],
            'destination_wallet_id' => $payload['type'] === 'transfer' ? $payload['destination_wallet_id'] : null,
            'category_id' => $payload['type'] === 'transfer' ? null : $payload['category_id'],
            'amount_minor' => $payload['amount_minor'],
            'transaction_date' => $payload['transaction_date'],
            'note' => $payload['note'] ?? null,
            'items' => $items === null ? null : json_encode($items, JSON_THROW_ON_ERROR),
            'updated_at' => $now,
        ];
        DB::table('transactions')->where('id', $transaction->id)->update($updated);
        $record = [
            'id' => (string) $transaction->id, 'user_id' => $userId, 'version' => (string) $version,
            'type' => $updated['type'], 'wallet_id' => $updated['wallet_id'], 'destination_wallet_id' => $updated['destination_wallet_id'],
            'category_id' => $updated['category_id'], 'amount_minor' => (string) $updated['amount_minor'],
            'transaction_date' => $updated['transaction_date'], 'note' => $updated['note'], 'items' => $items,
            'created_at' => $transaction->created_at, 'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'), 'deleted_at' => null,
        ];

        return $this->storeUpdateResult($operation, $requestHash, $userId, $head, $now, 'transactions', $record, $version);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function updateWallet(array $operation, string $requestHash, string $userId, object $head, string $name, string $openingBalance, \DateTimeInterface $now): JsonResponse
    {
        $wallet = DB::table('wallets')->where('user_id', $userId)->where('id', $operation['entity_id'])->lockForUpdate()->first();
        if ($wallet === null || $wallet->deleted_at !== null) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'This wallet is unavailable.', 409);
        }
        if ((string) $wallet->version !== $operation['base_version']) {
            return $this->errorResponse('VERSION_CONFLICT', 'This record changed on another device. Review before retrying.', 409);
        }
        if ((bool) $wallet->is_archived) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'Archived wallets cannot be edited.', 409);
        }

        $nameKey = mb_strtolower($name, 'UTF-8');
        if (DB::table('wallets')->where('user_id', $userId)->where('name_key', $nameKey)->where('id', '!=', $wallet->id)->exists()) {
            return $this->errorResponse('DUPLICATE_NAME', 'A wallet with this name already exists.', 409);
        }

        $version = (int) $wallet->version + 1;
        $updated = [
            'version' => $version, 'name' => $name, 'name_key' => $nameKey, 'type' => $operation['payload']['type'],
            'currency' => $operation['payload']['currency'] ?? $wallet->currency,
            'opening_balance_minor' => $openingBalance, 'opening_date' => $operation['payload']['opening_date'], 'updated_at' => $now,
        ];
        DB::table('wallets')->where('id', $wallet->id)->update($updated);
        $record = [
            'id' => (string) $wallet->id, 'user_id' => $userId, 'version' => (string) $version,
            'name' => $updated['name'], 'type' => $updated['type'], 'currency' => $updated['currency'],
            'opening_balance_minor' => (string) $updated['opening_balance_minor'], 'opening_date' => $updated['opening_date'],
            'is_archived' => false, 'created_at' => $wallet->created_at, 'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'), 'deleted_at' => null,
        ];

        return $this->storeUpdateResult($operation, $requestHash, $userId, $head, $now, 'wallets', $record, $version);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function deleteTransaction(array $operation, string $requestHash, string $userId, object $head, \DateTimeInterface $now): JsonResponse
    {
        $transaction = DB::table('transactions')->where('user_id', $userId)->where('id', $operation['entity_id'])->lockForUpdate()->first();
        if ($transaction === null || $transaction->deleted_at !== null) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'This transaction is unavailable.', 409);
        }
        if ((string) $transaction->version !== $operation['base_version']) {
            return $this->errorResponse('VERSION_CONFLICT', 'This record changed on another device. Review before retrying.', 409);
        }

        $version = (int) $transaction->version + 1;
        DB::table('transactions')->where('id', $transaction->id)->update([
            'version' => $version,
            'deleted_at' => $now,
            'updated_at' => $now,
        ]);
        $record = [
            'id' => (string) $transaction->id, 'user_id' => $userId, 'version' => (string) $version,
            'type' => $transaction->type, 'wallet_id' => (string) $transaction->wallet_id,
            'destination_wallet_id' => $transaction->destination_wallet_id === null ? null : (string) $transaction->destination_wallet_id,
            'category_id' => $transaction->category_id === null ? null : (string) $transaction->category_id,
            'amount_minor' => (string) $transaction->amount_minor, 'transaction_date' => $transaction->transaction_date,
            'note' => $transaction->note,
            'items' => $transaction->items === null ? null : json_decode($transaction->items, true, 512, JSON_THROW_ON_ERROR),
            'created_at' => $transaction->created_at, 'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
            'deleted_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
        ];

        return $this->storeUpdateResult($operation, $requestHash, $userId, $head, $now, 'transactions', $record, $version, 'delete');
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function archiveWallet(array $operation, string $requestHash, string $userId, object $head, \DateTimeInterface $now): JsonResponse
    {
        $wallet = DB::table('wallets')->where('user_id', $userId)->where('id', $operation['entity_id'])->lockForUpdate()->first();
        if ($wallet === null || $wallet->deleted_at !== null || (bool) $wallet->is_archived) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'This wallet is unavailable.', 409);
        }
        if ((string) $wallet->version !== $operation['base_version']) {
            return $this->errorResponse('VERSION_CONFLICT', 'This record changed on another device. Review before retrying.', 409);
        }

        $version = (int) $wallet->version + 1;
        DB::table('wallets')->where('id', $wallet->id)->update([
            'version' => $version,
            'is_archived' => true,
            'updated_at' => $now,
        ]);
        $record = [
            'id' => (string) $wallet->id, 'user_id' => $userId, 'version' => (string) $version,
            'name' => $wallet->name, 'type' => $wallet->type, 'currency' => $wallet->currency,
            'opening_balance_minor' => (string) $wallet->opening_balance_minor, 'opening_date' => $wallet->opening_date,
            'is_archived' => true, 'created_at' => $wallet->created_at,
            'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'), 'deleted_at' => null,
        ];

        return $this->storeUpdateResult($operation, $requestHash, $userId, $head, $now, 'wallets', $record, $version);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function transactionReferencesAreAvailable(array $payload, string $userId): bool
    {
        $wallet = DB::table('wallets')->where('user_id', $userId)->where('id', $payload['wallet_id'])->where('is_archived', false)->whereNull('deleted_at')->exists();
        if (! $wallet) {
            return false;
        }
        if ($payload['type'] === 'transfer') {
            return DB::table('wallets')->where('user_id', $userId)->where('id', $payload['destination_wallet_id'])->where('is_archived', false)->whereNull('deleted_at')->exists();
        }

        return DB::table('categories')->where('user_id', $userId)->where('id', $payload['category_id'])->where('type', $payload['type'])->where('is_archived', false)->whereNull('deleted_at')->exists();
    }

    /**
     * @param  array<string, mixed>  $operation
     * @param  array<string, mixed>  $record
     */
    private function storeUpdateResult(array $operation, string $requestHash, string $userId, object $head, \DateTimeInterface $now, string $entityType, array $record, int $version, string $changeAction = 'upsert'): JsonResponse
    {
        $sequence = (int) $head->last_sequence + 1;
        $result = ['data' => [
            'user_id' => $userId, 'operation_id' => $operation['operation_id'], 'entity_type' => $entityType,
            'entity_id' => $operation['entity_id'], 'version' => (string) $version, 'sequence' => (string) $sequence, 'record' => $record,
        ]];
        DB::table('sync_changes')->insert([
            'user_id' => $userId, 'sequence' => $sequence, 'entity_type' => $entityType, 'entity_id' => $operation['entity_id'],
            'entity_version' => $version, 'action' => $changeAction, 'payload' => json_encode($record, JSON_THROW_ON_ERROR),
            'operation_id' => $operation['operation_id'], 'created_at' => $now,
        ]);
        DB::table('sync_operations')->insert([
            'user_id' => $userId, 'operation_id' => $operation['operation_id'], 'device_id' => $operation['device_id'],
            'entity_type' => $entityType, 'entity_id' => $operation['entity_id'], 'request_hash' => $requestHash,
            'result' => json_encode($result, JSON_THROW_ON_ERROR), 'applied_at' => $now,
        ]);
        DB::table('sync_heads')->where('user_id', $userId)->update(['last_sequence' => $sequence, 'updated_at' => $now]);

        return response()->json($result);
    }

    /** @param array<int, array{name: string, quantity: int, unit_price_minor: string}> $items */
    private function itemsTotal(array $items): string
    {
        $total = 0;
        foreach ($items as $item) {
            $total += (int) $item['quantity'] * (int) $item['unit_price_minor'];
        }

        return (string) $total;
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function createCategory(array $operation, string $requestHash, string $userId, object $head, string $name, \DateTimeInterface $now): JsonResponse
    {
        if (! in_array($operation['payload']['type'], ['income', 'expense'], true)) {
            return $this->errorResponse('VALIDATION_FAILED', 'Please correct the highlighted fields.', 422, [
                'payload.type' => ['Choose income or expense for a category.'],
            ]);
        }

        $nameKey = mb_strtolower($name, 'UTF-8');
        if (DB::table('categories')->where('id', $operation['entity_id'])->exists()) {
            return $this->errorResponse('ENTITY_ID_IN_USE', 'This category ID is already in use.', 409);
        }

        if (DB::table('categories')
            ->where('user_id', $userId)
            ->where('type', $operation['payload']['type'])
            ->where('name_key', $nameKey)
            ->exists()) {
            return $this->errorResponse('DUPLICATE_NAME', 'A category with this name and type already exists.', 409);
        }

        $sequence = (int) $head->last_sequence + 1;
        $version = 1;
        $category = [
            'id' => $operation['entity_id'],
            'user_id' => $userId,
            'version' => $version,
            'name' => $name,
            'description' => $operation['payload']['description'] ?? null,
            'name_key' => $nameKey,
            'type' => $operation['payload']['type'],
            'icon' => $operation['payload']['icon'] ?? 'tag',
            'icon_image' => $operation['payload']['icon_image'] ?? null,
            'is_archived' => false,
            'created_at' => $now,
            'updated_at' => $now,
            'deleted_at' => null,
        ];

        DB::table('categories')->insert($category);
        $record = [
            'id' => (string) $category['id'],
            'user_id' => $userId,
            'version' => (string) $version,
            'name' => $name,
            'description' => $category['description'],
            'type' => $category['type'],
            'icon' => $category['icon'],
            'icon_image' => $category['icon_image'],
            'is_archived' => false,
            'created_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
            'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
            'deleted_at' => null,
        ];
        $result = ['data' => [
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'entity_type' => 'categories',
            'entity_id' => $operation['entity_id'],
            'version' => (string) $version,
            'sequence' => (string) $sequence,
            'record' => $record,
        ]];

        DB::table('sync_changes')->insert([
            'user_id' => $userId,
            'sequence' => $sequence,
            'entity_type' => 'categories',
            'entity_id' => $operation['entity_id'],
            'entity_version' => $version,
            'action' => 'upsert',
            'payload' => json_encode($record, JSON_THROW_ON_ERROR),
            'operation_id' => $operation['operation_id'],
            'created_at' => $now,
        ]);
        DB::table('sync_operations')->insert([
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'device_id' => $operation['device_id'],
            'entity_type' => 'categories',
            'entity_id' => $operation['entity_id'],
            'request_hash' => $requestHash,
            'result' => json_encode($result, JSON_THROW_ON_ERROR),
            'applied_at' => $now,
        ]);
        DB::table('sync_heads')->where('user_id', $userId)->update([
            'last_sequence' => $sequence,
            'updated_at' => $now,
        ]);

        return response()->json($result);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function updateCategory(array $operation, string $requestHash, string $userId, object $head, string $name, \DateTimeInterface $now): JsonResponse
    {
        $category = DB::table('categories')->where('user_id', $userId)->where('id', $operation['entity_id'])->lockForUpdate()->first();
        if ($category === null) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'This category is unavailable.', 409);
        }
        if ((string) $category->version !== $operation['base_version']) {
            return $this->errorResponse('VERSION_CONFLICT', 'This category changed on another device. Refresh and try again.', 409);
        }

        $nextType = $operation['action'] === 'archive' ? $category->type : $operation['payload']['type'];
        if ($nextType !== $category->type && DB::table('transactions')->where('user_id', $userId)->where('category_id', $category->id)->exists()) {
            return $this->errorResponse('CATEGORY_TYPE_LOCKED', 'A category with transaction history cannot change type.', 409);
        }

        $nameKey = mb_strtolower($name, 'UTF-8');
        if (DB::table('categories')->where('user_id', $userId)->where('type', $nextType)->where('name_key', $nameKey)->where('id', '!=', $category->id)->exists()) {
            return $this->errorResponse('DUPLICATE_NAME', 'A category with this name and type already exists.', 409);
        }

        $version = (int) $category->version + 1;
        $updated = [
            'name' => $name,
            'description' => array_key_exists('description', $operation['payload']) ? $operation['payload']['description'] : $category->description,
            'name_key' => $nameKey,
            'type' => $nextType,
            'icon' => $operation['payload']['icon'] ?? $category->icon,
            'icon_image' => array_key_exists('icon_image', $operation['payload']) ? $operation['payload']['icon_image'] : $category->icon_image,
            'is_archived' => $operation['action'] === 'archive' ? true : (bool) $category->is_archived,
            'version' => $version,
            'updated_at' => $now,
        ];
        DB::table('categories')->where('id', $category->id)->update($updated);

        $record = [
            'id' => (string) $category->id,
            'user_id' => $userId,
            'version' => (string) $version,
            'name' => $updated['name'],
            'description' => $updated['description'],
            'type' => $updated['type'],
            'icon' => $updated['icon'],
            'icon_image' => $updated['icon_image'],
            'is_archived' => $updated['is_archived'],
            'created_at' => $category->created_at,
            'updated_at' => $now->format('Y-m-d\\TH:i:s.u\\Z'),
            'deleted_at' => null,
        ];
        $sequence = (int) $head->last_sequence + 1;
        $result = ['data' => [
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'entity_type' => 'categories',
            'entity_id' => $category->id,
            'version' => (string) $version,
            'sequence' => (string) $sequence,
            'record' => $record,
        ]];
        DB::table('sync_changes')->insert([
            'user_id' => $userId, 'sequence' => $sequence, 'entity_type' => 'categories', 'entity_id' => $category->id,
            'entity_version' => $version, 'action' => 'upsert', 'payload' => json_encode($record, JSON_THROW_ON_ERROR),
            'operation_id' => $operation['operation_id'], 'created_at' => $now,
        ]);
        DB::table('sync_operations')->insert([
            'user_id' => $userId, 'operation_id' => $operation['operation_id'], 'device_id' => $operation['device_id'],
            'entity_type' => 'categories', 'entity_id' => $category->id, 'request_hash' => $requestHash,
            'result' => json_encode($result, JSON_THROW_ON_ERROR), 'applied_at' => $now,
        ]);
        DB::table('sync_heads')->where('user_id', $userId)->update(['last_sequence' => $sequence, 'updated_at' => $now]);

        return response()->json($result);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function createBudget(array $operation, string $requestHash, string $userId, object $head, \DateTimeInterface $now): JsonResponse
    {
        $payload = $operation['payload'];
        $category = DB::table('categories')
            ->where('user_id', $userId)
            ->where('id', $payload['category_id'])
            ->where('type', 'expense')
            ->where('is_archived', false)
            ->whereNull('deleted_at')
            ->first();

        if ($category === null) {
            return $this->errorResponse('REFERENCE_UNAVAILABLE', 'The expense category is unavailable.', 409);
        }

        if (DB::table('budgets')->where('id', $operation['entity_id'])->exists()) {
            return $this->errorResponse('ENTITY_ID_IN_USE', 'This budget ID is already in use.', 409);
        }

        if (DB::table('budgets')
            ->where('user_id', $userId)
            ->where('category_id', $payload['category_id'])
            ->where('month_start', $payload['month_start'])
            ->exists()) {
            return $this->errorResponse('DUPLICATE_BUDGET', 'A budget already exists for this category and month.', 409);
        }

        $sequence = (int) $head->last_sequence + 1;
        $version = 1;
        $budget = [
            'id' => $operation['entity_id'],
            'user_id' => $userId,
            'version' => $version,
            'category_id' => $payload['category_id'],
            'limit_minor' => $payload['limit_minor'],
            'month_start' => $payload['month_start'],
            'created_at' => $now,
            'updated_at' => $now,
            'deleted_at' => null,
        ];
        DB::table('budgets')->insert($budget);
        $record = [
            'id' => (string) $budget['id'],
            'user_id' => $userId,
            'version' => (string) $version,
            'category_id' => (string) $budget['category_id'],
            'limit_minor' => (string) $budget['limit_minor'],
            'month_start' => $budget['month_start'],
            'deleted_at' => null,
        ];
        $result = ['data' => [
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'entity_type' => 'budgets',
            'entity_id' => $operation['entity_id'],
            'version' => (string) $version,
            'sequence' => (string) $sequence,
            'record' => $record,
        ]];
        DB::table('sync_changes')->insert([
            'user_id' => $userId,
            'sequence' => $sequence,
            'entity_type' => 'budgets',
            'entity_id' => $operation['entity_id'],
            'entity_version' => $version,
            'action' => 'upsert',
            'payload' => json_encode($record, JSON_THROW_ON_ERROR),
            'operation_id' => $operation['operation_id'],
            'created_at' => $now,
        ]);
        DB::table('sync_operations')->insert([
            'user_id' => $userId,
            'operation_id' => $operation['operation_id'],
            'device_id' => $operation['device_id'],
            'entity_type' => 'budgets',
            'entity_id' => $operation['entity_id'],
            'request_hash' => $requestHash,
            'result' => json_encode($result, JSON_THROW_ON_ERROR),
            'applied_at' => $now,
        ]);
        DB::table('sync_heads')->where('user_id', $userId)->update([
            'last_sequence' => $sequence,
            'updated_at' => $now,
        ]);

        return response()->json($result);
    }

    /**
     * @param  array<string, mixed>  $operation
     */
    private function requestHash(string $userId, array $operation): string
    {
        $canonical = [
            'protocol' => '1',
            'user_id' => $userId,
            ...$operation,
        ];

        return hash('sha256', json_encode($this->sortKeys($canonical), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>
     */
    private function sortKeys(array $value): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->sortKeys($item);
            }
        }

        ksort($value);

        return $value;
    }

    /**
     * @param  array<string, mixed>  $wallet
     * @return array<string, mixed>
     */
    private function walletRecord(array $wallet): array
    {
        return [
            'id' => (string) $wallet['id'],
            'user_id' => (string) $wallet['user_id'],
            'version' => (string) $wallet['version'],
            'name' => $wallet['name'],
            'type' => $wallet['type'],
            'currency' => $wallet['currency'],
            'opening_balance_minor' => (string) $wallet['opening_balance_minor'],
            'opening_date' => $wallet['opening_date'],
            'is_archived' => (bool) $wallet['is_archived'],
            'created_at' => $wallet['created_at']->format('Y-m-d\TH:i:s.u\Z'),
            'updated_at' => $wallet['updated_at']->format('Y-m-d\TH:i:s.u\Z'),
            'deleted_at' => null,
        ];
    }

    /**
     * @param  array<string, array<int, string>>  $fields
     */
    private function errorResponse(string $code, string $message, int $status, array $fields = [], ?string $requestId = null): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => $code,
                'message' => $message,
                ...($fields === [] ? [] : ['fields' => $fields]),
                'request_id' => $requestId ?? (string) Str::uuid(),
            ],
        ], $status);
    }
}
