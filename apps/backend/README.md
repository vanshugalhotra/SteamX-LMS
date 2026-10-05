# STEAMX LMS: Backend

## Setup

Requires Node (see `.nvmrc`), pnpm, and PostgreSQL 18.

First create the dedicated local role and databases once, while connected to
PostgreSQL as an administrator (for example, with `psql -U postgres`):

```sql
CREATE ROLE steamx_local LOGIN PASSWORD 'local_dev_password';
CREATE DATABASE steamx_lms OWNER steamx_local;
CREATE DATABASE steamx_lms_test OWNER steamx_local;
```

Then, from the repository root, install dependencies, configure the development
URL, and generate the Prisma client:

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
pnpm --filter @steamx/backend prisma:generate
```

The development URL belongs in `apps/backend/.env`:

```text
DATABASE_URL=postgresql://steamx_local:local_dev_password@localhost:5432/steamx_lms
```

E2E tests automatically load `apps/backend/.env.test`, which points to:

```text
DATABASE_URL=postgresql://steamx_local:local_dev_password@localhost:5432/steamx_lms_test
```

Existing environment variables take precedence over `.env.test`, so CI only
overrides `DATABASE_URL`. Environment variables are validated at startup; see
`.env.example` for development settings.

## Commands

```bash
pnpm --filter @steamx/backend start:dev                       # run with watch
pnpm --filter @steamx/backend test                            # unit tests
pnpm --filter @steamx/backend test:e2e                        # e2e (uses .env.test)
pnpm --filter @steamx/backend migrate:dev --name <name>       # create/apply migration after adding schema changes
pnpm --filter @steamx/backend migrate:deploy                  # apply migrations (CI/production)
```

## Conventions

- Routes live under `/api/v1`. Swagger is at `/api/docs` when `SWAGGER_ENABLED=true`.
  `GET /health/live` is at the root.
- Errors always look like `{ statusCode, code, message, details?, requestId }`.
- Prisma is used only in the data-access layer, never in controllers.
- Logging: inject `PinoLogger`, log IDs and facts, never tokens or personal data.
