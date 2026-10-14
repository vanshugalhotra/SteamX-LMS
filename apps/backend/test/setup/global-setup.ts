import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import './setup-env.js';

const prismaCliPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/prisma/build/index.js',
);

const resetTestData = `
DO $reset$
DECLARE
  table_list text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO table_list
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN (
      '_prisma_migrations',
      'roles',
      'permissions',
      'role_permissions'
    );

  IF table_list IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
  END IF;
END
$reset$;
`;

export default async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Refusing to reset the e2e database because DATABASE_URL is not set.');
  }

  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${databaseName}".`);
  }

  const migration = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
    stdio: 'inherit',
  });

  if (migration.error) {
    throw new Error('Could not start Prisma migrations before e2e tests.', {
      cause: migration.error,
    });
  }

  if (migration.status !== 0) {
    throw new Error('Prisma migrate deploy failed before e2e tests.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(resetTestData);
  } finally {
    await pool.end();
  }
}
