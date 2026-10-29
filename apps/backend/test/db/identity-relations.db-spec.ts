import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext, type RawDbContext } from '../support/raw-db-context.js';

describe('identity foreign keys and indexes', () => {
  let client: Client;
  let db: RawDbContext;

  beforeEach(async () => {
    client = await connectRawClient();
    await client.query('BEGIN');
    db = createRawDbContext(client);
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });

  it('rejects a role and user_type mismatch and a profile assigned to another school', async () => {
    const firstSchoolId = await db.createSchool();
    const secondSchoolId = await db.createSchool();
    await db.expectFailure(
      `INSERT INTO users (id, steamx_id, name, password_hash, role_id, user_type, school_id, updated_at)
       SELECT $1, $2, 'Test User', 'test-hash', id, 'SCHOOL_STAFF', $3, now()
       FROM roles WHERE key = 'admin'`,
      [randomUUID(), `U${randomUUID().slice(0, 10).toUpperCase()}`, firstSchoolId],
      { code: '23503', constraint: 'users_role_id_user_type_fkey' },
    );

    const sectionId = await db.createClassSection(firstSchoolId);
    const studentId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId: firstSchoolId,
    });
    await db.expectFailure(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [studentId, secondSchoolId, sectionId],
      { code: '23503', constraint: 'student_profiles_user_id_school_id_user_type_fkey' },
    );
  });

  it('rejects a student profile whose class section belongs to another school', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const studentId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
    });
    const foreignSectionId = await db.createClassSection(otherSchoolId);
    await db.expectFailure(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [studentId, schoolId, foreignSectionId],
      { code: '23503', constraint: 'student_profiles_class_section_id_school_id_fkey' },
    );
  });

  it.each([
    {
      table: 'roles',
      constraint: 'role_permissions_role_id_fkey',
      insert: async (schoolId: string) =>
        db.createUser({ userType: 'SCHOOL_STAFF', roleKey: 'teacher', schoolId }),
      target: async () => {
        const result = await client.query<{ id: number }>(
          `SELECT id FROM roles WHERE key = 'teacher'`,
        );
        return db.firstRow(result.rows).id;
      },
      column: 'id',
      keyType: 'integer',
    },
    {
      table: 'schools',
      constraint: 'class_sections_school_id_fkey',
      insert: async (schoolId: string) => db.createClassSection(schoolId),
      target: async (schoolId: string) => schoolId,
      column: 'id',
      keyType: 'uuid',
    },
  ])(
    'restricts updates to referenced $table rows',
    async ({ table, constraint, insert, target, column, keyType }) => {
      const schoolId = await db.createSchool();
      const referencedId = await target(schoolId);
      await insert(schoolId);
      const changedId = keyType === 'uuid' ? randomUUID() : -999999;
      await db.expectFailure(
        `UPDATE ${table} SET ${column} = $1 WHERE id = $2`,
        [changedId, referencedId],
        { code: '23001', constraint },
      );
    },
  );

  it('restricts changing referenced class-section and user IDs', async () => {
    const schoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const studentId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
    });
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [studentId, schoolId, sectionId],
    );
    const teacherId = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId,
    });
    await client.query(
      `INSERT INTO teacher_profiles (user_id, school_id, updated_at)
       VALUES ($1, $2, now())`,
      [teacherId, schoolId],
    );

    await db.expectFailure(
      'UPDATE class_sections SET id = $1 WHERE id = $2',
      [randomUUID(), sectionId],
      {
        code: '23001',
        constraint: 'student_profiles_class_section_id_school_id_fkey',
      },
    );
    await db.expectFailure('UPDATE users SET id = $1 WHERE id = $2', [randomUUID(), teacherId], {
      code: '23001',
      constraint: 'teacher_profiles_user_id_school_id_user_type_fkey',
    });
  });

  it('restricts deleting referenced schools, roles, class sections, and users', async () => {
    const schoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const studentId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
    });
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [studentId, schoolId, sectionId],
    );
    const sectionOnlySchoolId = await db.createSchool();
    await db.createClassSection(sectionOnlySchoolId);
    const teacherSchoolId = await db.createSchool();
    const teacherId = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId: teacherSchoolId,
    });
    await client.query(
      `INSERT INTO teacher_profiles (user_id, school_id, updated_at)
       VALUES ($1, $2, now())`,
      [teacherId, teacherSchoolId],
    );
    const role = await client.query<{ id: number }>(`SELECT id FROM roles WHERE key = 'teacher'`);

    await db.expectFailure('DELETE FROM schools WHERE id = $1', [sectionOnlySchoolId], {
      code: '23001',
      constraint: 'class_sections_school_id_fkey',
    });
    await db.expectFailure('DELETE FROM schools WHERE id = $1', [teacherSchoolId], {
      code: '23001',
      constraint: 'users_school_id_fkey',
    });
    await db.expectFailure('DELETE FROM roles WHERE id = $1', [db.firstRow(role.rows).id], {
      code: '23001',
      constraint: 'role_permissions_role_id_fkey',
    });
    await db.expectFailure('DELETE FROM class_sections WHERE id = $1', [sectionId], {
      code: '23001',
      constraint: 'student_profiles_class_section_id_school_id_fkey',
    });
    await db.expectFailure('DELETE FROM users WHERE id = $1', [teacherId], {
      code: '23001',
      constraint: 'teacher_profiles_user_id_school_id_user_type_fkey',
    });
  });

  it('enforces unique seed keys and the role-permission composite key', async () => {
    await db.expectFailure(
      `INSERT INTO roles (key, name, user_type) VALUES ('admin', 'Duplicate', 'PLATFORM_STAFF')`,
      [],
      { code: '23505', constraint: 'roles_key_key' },
    );
    await db.expectFailure(
      `INSERT INTO permissions (key, description)
       VALUES ('school.read', 'Duplicate')`,
      [],
      { code: '23505', constraint: 'permissions_key_key' },
    );
    await db.expectFailure(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
       WHERE r.key = 'admin' AND p.key = 'school.read'`,
      [],
      { code: '23505', constraint: 'role_permissions_pkey' },
    );
  });

  it('keeps every installed foreign key RESTRICT and every unique index valid', async () => {
    const foreignKeys = await client.query<{
      constraint_name: string;
      on_delete: string;
      on_update: string;
      validated: boolean;
    }>(
      `SELECT conname AS constraint_name,
              confdeltype::text AS on_delete,
              confupdtype::text AS on_update,
              convalidated AS validated
       FROM pg_constraint
       WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    );
    expect(foreignKeys.rowCount).toBe(58);
    expect(
      foreignKeys.rows.every(
        (foreignKey) =>
          foreignKey.on_delete === 'r' && foreignKey.on_update === 'r' && foreignKey.validated,
      ),
    ).toBe(true);

    const uniqueIndexes = await client.query<{
      total: number;
      partial: number;
      valid: number;
    }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE indpred IS NOT NULL)::int AS partial,
              count(*) FILTER (WHERE indisvalid)::int AS valid
       FROM pg_index index
       JOIN pg_class table_name ON table_name.oid = index.indrelid
       JOIN pg_namespace schema_name ON schema_name.oid = table_name.relnamespace
       WHERE schema_name.nspname = 'public' AND indisunique`,
    );
    expect(db.firstRow(uniqueIndexes.rows)).toEqual({ total: 73, partial: 2, valid: 73 });
  });
});
