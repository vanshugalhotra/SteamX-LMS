import { Pool } from 'pg';
import { getTestDatabaseUrl } from './setup-env.js';

export async function resetTestDatabase(): Promise<void> {
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });
  try {
    await pool.query(`
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
    `);
  } finally {
    await pool.end();
  }
}

await resetTestDatabase();
