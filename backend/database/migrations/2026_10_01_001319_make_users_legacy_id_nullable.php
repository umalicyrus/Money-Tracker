<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'legacy_id')) {
            return;
        }

        if (DB::connection()->getDriverName() === 'mariadb') {
            DB::statement('ALTER TABLE users MODIFY legacy_id BIGINT UNSIGNED NULL');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        throw new RuntimeException('Making users.legacy_id required again could discard UUID users without a legacy ID.');
    }
};
