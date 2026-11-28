#!/bin/sh
set -e

echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Migrations complete. Starting application..."
exec node dist/main.js
