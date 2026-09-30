#!/bin/sh
set -eu
mkdir -p storage/app/private storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
# Configuration is cached at runtime, never baked with build-time secrets.
php artisan config:cache --no-interaction
php artisan route:cache --no-interaction
exec docker-php-entrypoint "$@"
