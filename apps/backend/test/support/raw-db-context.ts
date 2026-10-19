import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

type PgFailure = Error & {
  code?: string;
  constraint?: string;
};

type ExpectedFailure = {
  code: string;
  constraint?: string;
  message?: string;
};

function firstRow<Row>(rows: Row[]): Row {
  const row = rows[0];
  if (!row) {
    throw new Error('Expected the PostgreSQL query to return a row.');
  }
  return row;
}

function triggerTable(triggerName: string): string {
  if (triggerName.startsWith('trg_roles_')) return 'roles';
  if (triggerName.startsWith('trg_schools_')) return 'schools';
  if (triggerName.startsWith('trg_class_sections_')) return 'class_sections';
  return 'users';
}

export function createRawDbContext(client: Client) {
  async function expectFailure(
    sql: string,
    values: unknown[],
    expected: ExpectedFailure,
  ): Promise<void> {
    await client.query('SAVEPOINT expected_failure');
    let failure: unknown;

    try {
      await client.query(sql, values);
    } catch (error) {
      failure = error;
    }

    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error) || !('code' in failure)) {
      throw new Error('PostgreSQL did not return the expected database error.');
    }

    const pgFailure = failure as PgFailure;
    expect(pgFailure.code).toBe(expected.code);
    if (expected.constraint) {
      expect(pgFailure.constraint).toBe(expected.constraint);
    }
    if (expected.message) {
      expect(pgFailure.message).toContain(expected.message);
    }
  }

  async function expectTriggerFailure(
    sql: string,
    values: unknown[],
    triggerName: string,
    message: string,
  ): Promise<void> {
    const trigger = await client.query(
      `SELECT 1 FROM pg_trigger
       WHERE tgrelid = $1::regclass AND tgname = $2 AND NOT tgisinternal`,
      [triggerTable(triggerName), triggerName],
    );
    expect(trigger.rowCount).toBe(1);
    await expectFailure(sql, values, {
      code: '23000',
      message,
    });
  }

  async function expectDeferredCommitFailure(triggerName: string, message: string): Promise<void> {
    const trigger = await client.query(
      'SELECT 1 FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal',
      [triggerName],
    );
    expect(trigger.rowCount).toBe(1);
    let failure: unknown;
    try {
      await client.query('COMMIT');
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error) || !('code' in failure)) {
      throw new Error('COMMIT did not return the expected deferred-trigger error.');
    }
    const pgFailure = failure as PgFailure;
    expect(pgFailure.code).toBe('23000');
    expect(pgFailure.message).toContain(message);
  }

  async function createSchool(
    overrides: {
      code?: string;
      name?: string;
      city?: string;
      contactEmail?: string | null;
    } = {},
  ): Promise<string> {
    const values = {
      code: `T${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`,
      name: 'Test School',
      city: 'Test City',
      contactEmail: null as string | null,
      ...overrides,
    };
    const result = await client.query<{ id: string }>(
      `INSERT INTO schools (id, code, name, city, state, postal_code, country, contact_email, updated_at)
       VALUES ($1, $2, $3, $4, 'Test State', '00000', 'Test Country', $5, now())
       RETURNING id`,
      [randomUUID(), values.code, values.name, values.city, values.contactEmail],
    );
    return firstRow(result.rows).id;
  }

  async function createClassSection(
    schoolId: string,
    className = 'Class 5',
    sectionName = 'A',
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO class_sections (id, school_id, class_name, section_name, updated_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [randomUUID(), schoolId, className, sectionName],
    );
    return firstRow(result.rows).id;
  }

  async function createUser(
    options: {
      userType?: 'PLATFORM_STAFF' | 'SCHOOL_STAFF' | 'STUDENT';
      roleKey?: 'admin' | 'teacher' | 'student';
      schoolId?: string | null;
      steamxId?: string;
      name?: string;
      email?: string | null;
    } = {},
  ): Promise<string> {
    const {
      userType = 'PLATFORM_STAFF',
      roleKey = 'admin',
      schoolId = null,
      steamxId = `T${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`,
      name = 'Test User',
      email = null,
    } = options;
    const result = await client.query<{ id: string }>(
      `INSERT INTO users
         (id, steamx_id, name, email, password_hash, role_id, user_type, school_id, updated_at)
       SELECT $1, $2, $3, $4, 'test-hash', id, $5, $6, now()
       FROM roles WHERE key = $7
       RETURNING id`,
      [randomUUID(), steamxId, name, email, userType, schoolId, roleKey],
    );
    return firstRow(result.rows).id;
  }

  return {
    createClassSection,
    createSchool,
    createUser,
    expectDeferredCommitFailure,
    expectFailure,
    expectTriggerFailure,
    firstRow,
  };
}

export type RawDbContext = ReturnType<typeof createRawDbContext>;
