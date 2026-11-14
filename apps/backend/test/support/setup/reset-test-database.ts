import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { getTestDatabaseUrl } from './setup-env.js';

const REFERENCE_MIGRATION_SUFFIX = '_reference_data';

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

    const migrationDirectories = await readdir(
      new URL('../../../prisma/migrations/', import.meta.url),
      { withFileTypes: true },
    );
    const referenceMigration = migrationDirectories.find(
      (entry) => entry.isDirectory() && entry.name.endsWith(REFERENCE_MIGRATION_SUFFIX),
    );
    if (!referenceMigration) {
      throw new Error('Reference-data migration directory was not found.');
    }

    const migrationSql = await readFile(
      new URL(
        `../../../prisma/migrations/${referenceMigration.name}/migration.sql`,
        import.meta.url,
      ),
      'utf8',
    );
    await pool.query('DELETE FROM role_permissions');
    for (const statement of migrationSql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)) {
      await pool.query(statement);
    }
  } finally {
    await pool.end();
  }
}

await resetTestDatabase();
