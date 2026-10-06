import { config } from 'dotenv';

config({ path: '.env.test', quiet: true });

// Safety net: e2e tests must never run against a non-test database.
const databaseName = new URL(process.env.DATABASE_URL ?? 'invalid://').pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing to run e2e tests against database "${databaseName}".`);
}
