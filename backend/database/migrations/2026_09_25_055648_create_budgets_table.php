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
        Schema::create('budgets', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->char('user_id', 36);
            $table->unsignedBigInteger('version')->default(1);
            $table->uuid('category_id');
            $table->bigInteger('limit_minor');
            $table->date('month_start');
            $table->timestamps(6);
            $table->dateTime('deleted_at', 6)->nullable();

            $table->unique(['user_id', 'id']);
            $table->unique(['user_id', 'category_id', 'month_start']);
            $table->index(['user_id', 'month_start']);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->foreign(['user_id', 'category_id'])->references(['user_id', 'id'])->on('categories')->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('budgets');
    }
};
