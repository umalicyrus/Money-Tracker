<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('wallets')) {
            Schema::table('wallets', function (Blueprint $table): void {
                $table->char('user_id', 36)->change();
                $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            });
        } else {
            Schema::create('wallets', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->char('user_id', 36);
                $table->unsignedBigInteger('version')->default(1);
                $table->string('name', 60);
                $table->string('name_key', 120);
                $table->string('type', 16);
                $table->char('currency', 3)->default('PHP');
                $table->bigInteger('opening_balance_minor')->default(0);
                $table->date('opening_date');
                $table->boolean('is_archived')->default(false);
                $table->timestamps(6);
                $table->dateTime('deleted_at', 6)->nullable();

                $table->unique(['user_id', 'id']);
                $table->unique(['user_id', 'name_key']);
                $table->index(['user_id', 'is_archived']);
                $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            });
        }

        Schema::create('sync_heads', function (Blueprint $table): void {
            $table->char('user_id', 36)->primary();
            $table->unsignedBigInteger('last_sequence')->default(0);
            $table->dateTime('updated_at', 6);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('sync_changes', function (Blueprint $table): void {
            $table->char('user_id', 36);
            $table->unsignedBigInteger('sequence');
            $table->string('entity_type', 16);
            $table->uuid('entity_id');
            $table->unsignedBigInteger('entity_version');
            $table->string('action', 8);
            $table->json('payload');
            $table->uuid('operation_id')->nullable();
            $table->dateTime('created_at', 6);

            $table->primary(['user_id', 'sequence']);
            $table->index(['user_id', 'entity_type', 'entity_id']);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('sync_operations', function (Blueprint $table): void {
            $table->char('user_id', 36);
            $table->uuid('operation_id');
            $table->uuid('device_id');
            $table->string('entity_type', 16);
            $table->uuid('entity_id');
            $table->char('request_hash', 64);
            $table->json('result');
            $table->dateTime('applied_at', 6);

            $table->primary(['user_id', 'operation_id']);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sync_operations');
        Schema::dropIfExists('sync_changes');
        Schema::dropIfExists('sync_heads');
        Schema::dropIfExists('wallets');
    }
};
