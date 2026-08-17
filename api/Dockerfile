# The Laravel API.
#
# In a container for the same reason as the other two: so running the system is
# one command, and so nobody needs a matching PHP with the right extensions
# enabled on their own machine. The host PHP here has no pdo_pgsql, which would
# otherwise have to be turned on by hand before anything worked.
FROM php:8.3-cli AS dev

# libpq-dev provides the PostgreSQL client headers pdo_pgsql compiles against.
# Without pdo_pgsql the app boots fine and fails on the first query, which reads
# as a connection problem rather than a missing extension.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev unzip \
 && docker-php-ext-install pdo_pgsql \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Dependencies first, so editing application code does not reinstall vendor/.
COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-scripts --prefer-dist

COPY . .
RUN composer dump-autoload --optimize

EXPOSE 8000

# The built-in server is right for a spike: no nginx or php-fpm to configure
# while the question is still whether Laravel can reach the database at all.
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
