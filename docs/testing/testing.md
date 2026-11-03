# Testing

## Test types

- **Unit** tests live beside the code in `apps/backend/src/**/*.spec.ts`. They test one class or
  function without a database.
- **Database** tests live in `apps/backend/test/db/*.db-spec.ts`. They test PostgreSQL constraints,
  triggers, migrations, and persistence behavior against the test database.
- **End-to-end (e2e)** tests live in `apps/backend/test/e2e/*.e2e-spec.ts`. They make HTTP requests
  through the real Nest application and database.
- **Invariant** tests live in `apps/backend/test/invariants/*.spec.ts`. They verify behavior that
  must hold across features, such as revoking a session after an account change.

Shared helpers and fixtures belong in `apps/backend/test/support/`.

## Running tests

Use `pnpm test` to run every backend test suite in order. To run one suite:

- `pnpm test:unit`
- `pnpm test:db`
- `pnpm test:e2e`
- `pnpm test:invariants`

Database-backed suites require `apps/backend/.env.test`, a reachable PostgreSQL test database, and
Prisma migrations. Test setup deploys migrations and clears test-created rows before each file.
The database URL must target a PostgreSQL database whose name ends in `_test`; tests stop otherwise.
The test environment also requires `AWS_REGION` and `S3_BUCKET`; use non-production values such as
`ap-south-1` and `test-bucket`. AWS credentials are optional and should be omitted in tests.
The `roles`, `permissions`, `role_permissions`, and `_prisma_migrations` tables are kept during reset.

## Test rules

- Test one behavior at a time and name it as behavior, for example, “returns 404 when the school is
  outside the caller's scope”.
- Tests are independent, order-free, and contain no sleeps.
- Control time and randomness through injection.
- In unit tests, mock only boundaries such as repositories and external services, never the class
  or function under test.
- Do not mock the database outside unit tests.
- Do not test PostgreSQL, NestJS, or Prisma themselves.
- Coverage percentage is not a goal; protect observable behavior.

## Definition of done

- A new database constraint or trigger has a database test.
- A new endpoint has an e2e test following [the API testing guide](./api-testing.md).
- A new business rule has a unit test.
- Relevant tests, lint, and type-check pass.
