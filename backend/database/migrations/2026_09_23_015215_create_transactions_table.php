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
        Schema::create('transactions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->char('user_id', 36);
            $table->unsignedBigInteger('version')->default(1);
            $table->string('type', 8);
            $table->uuid('wallet_id');
            $table->uuid('destination_wallet_id')->nullable();
            $table->uuid('category_id')->nullable();
            $table->bigInteger('amount_minor');
            $table->date('transaction_date');
            $table->string('note', 500)->nullable();
            $table->timestamps(6);
            $table->dateTime('deleted_at', 6)->nullable();

            $table->unique(['user_id', 'id']);
            $table->index(['user_id', 'transaction_date', 'id']);
            $table->index(['user_id', 'wallet_id', 'transaction_date']);
            $table->index(['user_id', 'category_id', 'transaction_date']);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->foreign(['user_id', 'wallet_id'])->references(['user_id', 'id'])->on('wallets')->restrictOnDelete();
            $table->foreign(['user_id', 'category_id'])->references(['user_id', 'id'])->on('categories')->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
