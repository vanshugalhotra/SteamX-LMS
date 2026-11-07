# Testing

This guide helps you choose and run the test suite for a change; start with the narrowest relevant
suite, then run broader checks before handover.

## Test suites

| Suite      | Location                        | What it checks                                                 |
| ---------- | ------------------------------- | -------------------------------------------------------------- |
| Unit       | `apps/backend/src/**/*.spec.ts` | A class or function without a database.                        |
| Database   | `apps/backend/test/db/`         | PostgreSQL migrations, constraints, triggers, and persistence. |
| End-to-end | `apps/backend/test/e2e/`        | HTTP behavior through the Nest app and database.               |
| Invariant  | `apps/backend/test/invariants/` | Rules that span feature modules.                               |
| Frontend   | `apps/frontend/src/**/*.test.*` | React components and frontend utilities with mocked API calls. |

Backend database-backed tests need an isolated PostgreSQL database whose name ends in `_test`.
They apply migrations and clear test-created rows. See [API testing](./api-testing.md) and
[workflow testing](./workflows-testing.md) before changing externally visible behavior.

## Commands

Run from the repository root:

```powershell
pnpm --filter @steamx/backend test:unit
pnpm --filter @steamx/backend test:db
pnpm --filter @steamx/backend test:e2e
pnpm --filter @steamx/backend test:invariants
pnpm --filter @steamx/backend lint
pnpm --filter @steamx/backend typecheck
pnpm --filter frontend test
pnpm --filter frontend lint
pnpm --filter frontend typecheck
```

`pnpm --filter @steamx/backend test` runs the four backend suites in order. The root
`pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` run workspace scripts.

## Test rules

- Keep tests independent and focused on observable behavior.
- Mock external boundaries in unit tests; do not mock PostgreSQL in database or e2e tests.
- Add a database test for new database constraints or triggers and an e2e test for new routes.
- Use an isolated test database. Never run reset commands against shared or production data.
- For the manual fixture accounts, see [testing seed data](./testing-seed-data.md). That seed is
  for a fresh development database, not the automated test database.
