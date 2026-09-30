<?php

namespace App\Console\Commands;

use Database\Seeders\July2026DemoDataSeeder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('money-tracker:seed-july-2026-demo-data')]
#[Description('Add idempotent July 2026 review data for the local Demo User.')]
class SeedJuly2026DemoData extends Command
{
    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('This command only runs in local or testing environments.');

            return self::FAILURE;
        }

        $this->laravel->make(July2026DemoDataSeeder::class)->run();
        $this->info('July 2026 sample data is ready for demo@example.com.');

        return self::SUCCESS;
    }
}
