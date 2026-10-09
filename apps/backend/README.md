# STEAMX LMS: Backend

## Project setup

Requires Node from `.nvmrc`, pnpm, and PostgreSQL 18. Create separate development
and test databases:

```sql
CREATE ROLE steamx_local LOGIN PASSWORD 'local_dev_password';
CREATE DATABASE steamx_lms OWNER steamx_local;
CREATE DATABASE steamx_lms_test OWNER steamx_local;
```

From the repository root, install dependencies, configure the backend, and
generate the Prisma client:

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
pnpm --filter @steamx/backend prisma:generate
```

Set `DATABASE_URL` in `apps/backend/.env` to the development database. E2E tests
use `apps/backend/.env.test` and the test database.

## Database

E2E tests automatically apply pending migrations to the `.env.test` database before they start.
Never edit an applied migration; create a new one.
CHECK constraints and expression indexes live in migrations (Prisma does not model them). Never edit applied migrations.
Frontend validation guidance for applied database checks is in [database_checks.md](../docs/database_checks.md).

## Configuration

- Set `AUTH_JWT_SECRET` to a generated secret of at least 32 characters; changing it signs everyone out.
- Set `AUTH_TOKEN_TTL_SECONDS` to the fixed token lifetime in seconds (default: `86400`).

## Commands

Run from the repository root:

```bash
pnpm --filter @steamx/backend start:dev
pnpm --filter @steamx/backend lint
pnpm --filter @steamx/backend typecheck
pnpm --filter @steamx/backend test
pnpm --filter @steamx/backend test:e2e
pnpm --filter @steamx/backend build
pnpm --filter @steamx/backend migrate:dev --name <name>
pnpm --filter @steamx/backend migrate:deploy
```

## Decisions and beware

- API routes use `/api/v1`. `/health/live` and `/health/ready` are root,
  unversioned routes; readiness returns `503` when PostgreSQL is unavailable.
- E2E tests use the real test database. Environment variables override values
  loaded from `.env.test`.
- Each API process has a PostgreSQL pool capped by `DB_POOL_MAX` (default `10`,
  range `1`–`50`). `DB_CONNECTION_TIMEOUT_MS` controls connection establishment
  (default `5000`, minimum `1000`). Align the pool limit with the database
  connection budget and number of API instances.
- Use `migrate:dev` to create and apply development migrations; use
  `migrate:deploy` to apply existing migrations in CI or production.
- Responses use `{ statusCode, code, message, details?, requestId }`.
