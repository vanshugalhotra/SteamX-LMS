import { Client, Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { getTestDatabaseUrl } from './setup/setup-env.js';

export async function connectRawClient(): Promise<Client> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  return client;
}

export async function rawSql<Row extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<Row[]> {
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });
  try {
    const result = await pool.query<Row>(sql, values);
    return result.rows;
  } finally {
    await pool.end();
  }
}
