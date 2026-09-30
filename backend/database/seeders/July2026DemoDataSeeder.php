<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class July2026DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('July demo data may only be seeded in local or testing environments.');
        }

        $user = User::query()->where('email', 'demo@example.com')->first();
        if ($user === null) {
            throw new RuntimeException('The local Demo User (demo@example.com) was not found.');
        }

        DB::transaction(function () use ($user): void {
            $now = now()->utc();
            $userId = $user->getKey();
            DB::table('sync_heads')->insertOrIgnore(['user_id' => $userId, 'last_sequence' => 0, 'updated_at' => $now]);
            $head = DB::table('sync_heads')->where('user_id', $userId)->lockForUpdate()->first();
            $sequence = (int) $head->last_sequence;

            foreach ($this->records($userId) as $sample) {
                if (DB::table($sample['table'])->where('id', $sample['id'])->exists()) {
                    continue;
                }

                DB::table($sample['table'])->insert([...$sample['record'], 'created_at' => $now, 'updated_at' => $now]);
                $sequence++;
                DB::table('sync_changes')->insert([
                    'user_id' => $userId, 'sequence' => $sequence, 'entity_type' => $sample['entity_type'], 'entity_id' => $sample['id'], 'entity_version' => 1,
                    'action' => 'upsert', 'payload' => json_encode($sample['payload'], JSON_THROW_ON_ERROR), 'operation_id' => null, 'created_at' => $now,
                ]);
            }

            DB::table('sync_heads')->where('user_id', $userId)->update(['last_sequence' => $sequence, 'updated_at' => $now]);
        });
    }

    /** @return array<int, array{table: string, entity_type: string, id: string, record: array<string, mixed>, payload: array<string, mixed>}> */
    private function records(string $userId): array
    {
        $cash = '10000000-0000-4000-8000-000000000001';
        $bank = '10000000-0000-4000-8000-000000000002';
        $salary = '20000000-0000-4000-8000-000000000001';
        $freelance = '20000000-0000-4000-8000-000000000002';
        $groceries = '20000000-0000-4000-8000-000000000003';
        $dining = '20000000-0000-4000-8000-000000000004';
        $transport = '20000000-0000-4000-8000-000000000005';
        $utilities = '20000000-0000-4000-8000-000000000006';
        $entertainment = '20000000-0000-4000-8000-000000000007';
        $wallet = fn (string $id, string $name, string $type, string $opening): array => ['table' => 'wallets', 'entity_type' => 'wallets', 'id' => $id, 'record' => ['id' => $id, 'user_id' => $userId, 'version' => 1, 'name' => $name, 'name_key' => mb_strtolower($name), 'type' => $type, 'currency' => 'PHP', 'opening_balance_minor' => $opening, 'opening_date' => '2026-07-01', 'is_archived' => false, 'deleted_at' => null], 'payload' => ['id' => $id, 'user_id' => $userId, 'version' => '1', 'name' => $name, 'type' => $type, 'currency' => 'PHP', 'opening_balance_minor' => $opening, 'opening_date' => '2026-07-01', 'is_archived' => false, 'deleted_at' => null]];
        $category = fn (string $id, string $name, string $type): array => ['table' => 'categories', 'entity_type' => 'categories', 'id' => $id, 'record' => ['id' => $id, 'user_id' => $userId, 'version' => 1, 'name' => $name, 'name_key' => mb_strtolower($name), 'type' => $type, 'icon' => 'tag', 'is_archived' => false, 'deleted_at' => null], 'payload' => ['id' => $id, 'user_id' => $userId, 'version' => '1', 'name' => $name, 'type' => $type, 'icon' => 'tag', 'is_archived' => false, 'deleted_at' => null]];
        $transaction = fn (string $id, string $type, string $walletId, string $categoryId, string $amount, string $date, string $note): array => ['table' => 'transactions', 'entity_type' => 'transactions', 'id' => $id, 'record' => ['id' => $id, 'user_id' => $userId, 'version' => 1, 'type' => $type, 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => $amount, 'transaction_date' => $date, 'note' => $note, 'deleted_at' => null], 'payload' => ['id' => $id, 'user_id' => $userId, 'version' => '1', 'type' => $type, 'wallet_id' => $walletId, 'category_id' => $categoryId, 'amount_minor' => $amount, 'transaction_date' => $date, 'note' => $note, 'deleted_at' => null]];
        $budget = fn (string $id, string $categoryId, string $limit): array => ['table' => 'budgets', 'entity_type' => 'budgets', 'id' => $id, 'record' => ['id' => $id, 'user_id' => $userId, 'version' => 1, 'category_id' => $categoryId, 'limit_minor' => $limit, 'month_start' => '2026-07-01', 'deleted_at' => null], 'payload' => ['id' => $id, 'user_id' => $userId, 'version' => '1', 'category_id' => $categoryId, 'limit_minor' => $limit, 'month_start' => '2026-07-01', 'deleted_at' => null]];

        return [
            $wallet($cash, 'Cash', 'cash', '150000'), $wallet($bank, 'Metrobank', 'bank', '500000'),
            $category($salary, 'Salary', 'income'), $category($freelance, 'Freelance', 'income'), $category($groceries, 'Groceries', 'expense'), $category($dining, 'Dining', 'expense'), $category($transport, 'Transport', 'expense'), $category($utilities, 'Utilities', 'expense'), $category($entertainment, 'Entertainment', 'expense'),
            $transaction('30000000-0000-4000-8000-000000000001', 'income', $bank, $salary, '8500000', '2026-07-01', 'July salary'), $transaction('30000000-0000-4000-8000-000000000002', 'income', $bank, $freelance, '1850000', '2026-07-15', 'Design project'),
            $transaction('30000000-0000-4000-8000-000000000003', 'expense', $cash, $groceries, '620000', '2026-07-03', 'Weekly groceries'), $transaction('30000000-0000-4000-8000-000000000004', 'expense', $cash, $dining, '125000', '2026-07-05', 'Lunch with friends'), $transaction('30000000-0000-4000-8000-000000000005', 'expense', $cash, $transport, '150000', '2026-07-07', 'Commuting'), $transaction('30000000-0000-4000-8000-000000000006', 'expense', $bank, $utilities, '420000', '2026-07-10', 'Electricity and internet'), $transaction('30000000-0000-4000-8000-000000000007', 'expense', $cash, $groceries, '480000', '2026-07-12', 'Market run'), $transaction('30000000-0000-4000-8000-000000000008', 'expense', $cash, $entertainment, '220000', '2026-07-16', 'Cinema tickets'), $transaction('30000000-0000-4000-8000-000000000009', 'expense', $cash, $dining, '185000', '2026-07-19', 'Dinner out'), $transaction('30000000-0000-4000-8000-000000000010', 'expense', $cash, $transport, '90000', '2026-07-22', 'Ride share'), $transaction('30000000-0000-4000-8000-000000000011', 'expense', $bank, $groceries, '310000', '2026-07-26', 'Household supplies'),
            $budget('40000000-0000-4000-8000-000000000001', $groceries, '1800000'), $budget('40000000-0000-4000-8000-000000000002', $dining, '500000'), $budget('40000000-0000-4000-8000-000000000003', $transport, '350000'), $budget('40000000-0000-4000-8000-000000000004', $entertainment, '300000'),
        ];
    }
}
