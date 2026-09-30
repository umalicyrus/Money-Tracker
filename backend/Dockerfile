FROM php:8.4-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libzip-dev libicu-dev libonig-dev libxml2-dev \
    && docker-php-ext-install pdo_mysql bcmath intl zip mbstring \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY . .

RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && chmod -R 775 storage bootstrap/cache

CMD ["sh", "-c", "php artisan serve --host=0.0.0.0 --port=${PORT:-8080}"]