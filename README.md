# SteamX LMS

SteamX LMS is a multi-school learning management system with a browser frontend and a REST API.
The backend currently implements authentication, user, school, and class-section workflows.

## Stack

- Backend: NestJS, TypeScript, Prisma, PostgreSQL
- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Workspace: pnpm

## Prerequisites

- Node.js 24 or newer
- pnpm 12.8.1
- PostgreSQL; the backend setup currently documents PostgreSQL 18

## Setup

Run commands from the repository root. Create a local PostgreSQL database, then configure the
backend connection and secrets using [`apps/backend/.env.example`](./apps/backend/.env.example).
The frontend API origin is configured in [`apps/frontend/.env.example`](./apps/frontend/.env.example).

For example, create separate development and test databases in PostgreSQL:

```sql
CREATE ROLE steamx_local LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE steamx_lms OWNER steamx_local;
CREATE DATABASE steamx_lms_test OWNER steamx_local;
```

```powershell
pnpm install
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env
pnpm --filter @steamx/backend prisma:generate
pnpm --filter @steamx/backend migrate:dev
```

Set `DATABASE_URL` and `AUTH_JWT_SECRET` in `apps/backend/.env`. To create the initial platform
admin, also set `ADMIN_STEAMX_ID` and `ADMIN_PASSWORD`, then run:

```powershell
pnpm --filter @steamx/backend admin:create
```

Keep real secrets out of source control. The backend environment template documents the available
variables and their example values.

## Run

Start the API and frontend in separate terminals:

```powershell
pnpm --filter @steamx/backend start:dev
pnpm --filter frontend dev
```

Swagger is available at `/api/docs` when enabled. The API base path is `/api/v1`; health checks
are unversioned at `/health/live` and `/health/ready`.

## Test and quality checks

```powershell
pnpm --filter @steamx/backend test
pnpm --filter @steamx/backend test:db
pnpm --filter @steamx/backend test:e2e
pnpm --filter @steamx/backend test:all
pnpm --filter @steamx/backend lint
pnpm --filter @steamx/backend typecheck
pnpm --filter frontend lint
pnpm --filter frontend typecheck
```

The root scripts `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm typecheck` run the matching
script across workspace packages.

## Repository map

- `apps/` — application workspaces.
- `apps/backend/` — NestJS API workspace.
- `apps/backend/src/` — API modules, shared request handling, and service code.
- `apps/backend/prisma/` — Prisma schema and committed PostgreSQL migrations.
- `apps/backend/test/` — database and HTTP integration tests; unit tests also live beside source.
- `apps/frontend/` — React single-page application workspace.
- `apps/frontend/src/` — React application, features, and shared UI.
- `docs/` — architecture, access-control, database, decision, and testing guides.
- `docs/runbooks/` — operational procedures, including [admin recovery](./docs/runbooks/admin-recovery.md).
- `infra/` — standalone AWS CDK app for staging infrastructure.
- `packages/` — shared-package workspace (currently no package directories).

## Documentation

- [Architecture](./docs/architecture.md)
- [Access control](./docs/access-control.md)
- [Database](./docs/database.md)
- [Decisions](./docs/decisions.md)
- [Backend environment variables](./apps/backend/.env.example)
- [Frontend setup and structure](./apps/frontend/README.md)
- [Backend setup reference](./apps/backend/README.md)
- [API testing checklist](./docs/api-testing.md)
- [Workflow testing](./docs/workflows-testing.md)
- [Infrastructure](./docs/infrastructure.md)
