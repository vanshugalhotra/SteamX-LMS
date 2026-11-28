#!/bin/sh
set -e

# Compose DATABASE_URL from ECS-injected credential fields (from the RDS Secrets Manager secret).
# This keeps the URL in sync with credential rotation — no separate URL secret needed.
export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/steamx?sslmode=require"

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "Running database migrations..."
  ./node_modules/.bin/prisma migrate deploy
  echo "Migrations complete."
else
  echo "SKIP_MIGRATIONS is set, skipping migrations."
fi

echo "Starting application..."
exec node dist/main.js
