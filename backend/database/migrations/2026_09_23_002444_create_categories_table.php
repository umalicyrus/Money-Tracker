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
        Schema::create('categories', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->char('user_id', 36);
            $table->unsignedBigInteger('version')->default(1);
            $table->string('name', 60);
            $table->string('name_key', 120);
            $table->string('type', 8);
            $table->string('icon', 40)->default('tag');
            $table->boolean('is_archived')->default(false);
            $table->timestamps(6);
            $table->dateTime('deleted_at', 6)->nullable();

            $table->unique(['user_id', 'id']);
            $table->unique(['user_id', 'type', 'name_key']);
            $table->index(['user_id', 'type', 'is_archived']);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
