FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM php:8.4-fpm-bookworm AS app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libicu-dev libonig-dev libzip-dev libpng-dev libjpeg62-turbo-dev libwebp-dev unzip \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install -j2 pdo_mysql mbstring intl bcmath gd zip opcache \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /var/www/html
COPY backend/ ./
RUN mkdir -p storage/app/private storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader \
    && chown -R www-data:www-data storage bootstrap/cache
COPY php.production.ini /usr/local/etc/php/conf.d/production.ini
COPY docker-entrypoint.sh /usr/local/bin/moneytracker-entrypoint
RUN chmod +x /usr/local/bin/moneytracker-entrypoint
ENTRYPOINT ["moneytracker-entrypoint"]
CMD ["php-fpm"]

FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /build/frontend/dist /srv/frontend
COPY backend/public/index.php /var/www/html/public/index.php
