<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'mariadb') {
            if (Schema::getColumnType('users', 'id') === 'integer') {
                throw new RuntimeException('The user UUID migration requires MariaDB for an existing integer users.id column.');
            }

            return;
        }

        $idColumn = DB::selectOne('SHOW COLUMNS FROM users WHERE Field = ?', ['id']);
        $idType = strtolower((string) ($idColumn->Type ?? ''));

        if ($idType === 'uuid' || str_starts_with($idType, 'char(36)')) {
            return;
        }

        if (! str_starts_with($idType, 'bigint')) {
            throw new RuntimeException('The user UUID migration found an unsupported users.id column type.');
        }

        if (! Schema::hasTable('user_id_migrations')) {
            Schema::create('user_id_migrations', function (Blueprint $table): void {
                $table->unsignedBigInteger('legacy_id')->primary();
                $table->char('uuid', 36)->unique();
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('users', 'uuid')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->char('uuid', 36)->nullable()->after('id');
            });
        }

        foreach (DB::table('users')->orderBy('id')->pluck('id') as $legacyId) {
            $uuid = DB::table('user_id_migrations')
                ->where('legacy_id', $legacyId)
                ->value('uuid');

            if ($uuid === null) {
                $uuid = (string) Str::uuid();
                DB::table('user_id_migrations')->insert([
                    'legacy_id' => $legacyId,
                    'uuid' => $uuid,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('users')->where('id', $legacyId)->update(['uuid' => $uuid]);
        }

        DB::table('sessions')->delete();

        DB::statement('ALTER TABLE sessions MODIFY user_id CHAR(36) NULL');
        DB::statement('ALTER TABLE users DROP PRIMARY KEY, CHANGE id legacy_id BIGINT UNSIGNED NOT NULL, CHANGE uuid id CHAR(36) NOT NULL, ADD PRIMARY KEY (id)');
    }

    public function down(): void
    {
        throw new RuntimeException('The user UUID migration is irreversible. Restore the pre-migration database backup instead.');
    }
};
