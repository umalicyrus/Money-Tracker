<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SyncDownloadController;
use App\Http\Controllers\SyncOperationController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::post('/v1/sync/operations', [SyncOperationController::class, 'store'])
    ->middleware('auth:sanctum');

Route::get('/v1/sync/records', [SyncDownloadController::class, 'index'])
    ->middleware('auth:sanctum');

Route::prefix('/v1/profile')->middleware('auth:sanctum')->group(function (): void {
    Route::get('/', [ProfileController::class, 'show']);
    Route::patch('/', [ProfileController::class, 'update']);
    Route::post('/photo', [ProfileController::class, 'storePhoto']);
    Route::delete('/photo', [ProfileController::class, 'destroyPhoto']);
    Route::get('/photo', [ProfileController::class, 'photo']);
    Route::put('/password', [ProfileController::class, 'updatePassword']);
});
