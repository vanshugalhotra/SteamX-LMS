import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext, type RawDbContext } from '../support/raw-db-context.js';

describe('identity triggers', () => {
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

  it('rejects changes to immutable role keys, school codes, class school IDs, and user identity', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const userId = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId,
    });
    const role = await client.query<{ id: number }>(`SELECT id FROM roles WHERE key = 'teacher'`);
    await db.expectTriggerFailure(
      'UPDATE roles SET key = $1 WHERE id = $2',
      [`changed-${randomUUID()}`, db.firstRow(role.rows).id],
      'trg_roles_immutable_key',
      'roles.key is immutable',
    );
    await db.expectTriggerFailure(
      'UPDATE schools SET code = $1 WHERE id = $2',
      [`X${randomUUID().slice(0, 10).toUpperCase()}`, schoolId],
      'trg_schools_immutable_code',
      'schools.code is immutable',
    );
    await db.expectTriggerFailure(
      'UPDATE class_sections SET school_id = $1 WHERE id = $2',
      [otherSchoolId, sectionId],
      'trg_class_sections_immutable_school_id',
      'class_sections.school_id is immutable',
    );
    await db.expectTriggerFailure(
      "UPDATE users SET user_type = 'STUDENT' WHERE id = $1",
      [userId],
      'trg_users_immutable_identity',
      'users.user_type is immutable',
    );
    await db.expectTriggerFailure(
      'UPDATE users SET school_id = NULL WHERE id = $1',
      [userId],
      'trg_users_immutable_identity',
      'users.school_id is immutable',
    );
  });

  it('allows mutable updates while protecting SteamX ID changes with transaction-local authorization', async () => {
    const schoolId = await db.createSchool();
    const userId = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId,
    });
    await client.query(
      `INSERT INTO teacher_profiles (user_id, school_id, updated_at)
       VALUES ($1, $2, now())`,
      [userId, schoolId],
    );
    await client.query("SELECT set_config('steamx.allow_steamx_id_change', 'on', true)");
    await client.query(`UPDATE users SET steamx_id = $1, name = 'Updated User' WHERE id = $2`, [
      `U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`,
      userId,
    ]);
    await client.query(`UPDATE schools SET name = 'Updated School' WHERE id = $1`, [schoolId]);
    await client.query('COMMIT');
    await client.query('BEGIN');
    await db.expectTriggerFailure(
      'UPDATE users SET steamx_id = $1 WHERE id = $2',
      [`U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`, userId],
      'trg_users_immutable_steamx_id',
      'users.steamx_id is immutable',
    );

    const otherClient = await connectRawClient();
    try {
      await expect(
        otherClient.query('UPDATE users SET steamx_id = $1 WHERE id = $2', [
          `U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`,
          userId,
        ]),
      ).rejects.toMatchObject({ code: '23000' });
    } finally {
      await otherClient.end();
    }
  });

  it('does not retain SteamX ID authorization after a transaction commits or rolls back', async () => {
    const userId = await db.createUser();
    await client.query("SELECT set_config('steamx.allow_steamx_id_change', 'on', true)");
    await client.query(`UPDATE users SET steamx_id = $1 WHERE id = $2`, [
      `U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`,
      userId,
    ]);
    await client.query('COMMIT');
    await client.query('BEGIN');
    await db.expectTriggerFailure(
      'UPDATE users SET steamx_id = $1 WHERE id = $2',
      [`U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`, userId],
      'trg_users_immutable_steamx_id',
      'users.steamx_id is immutable',
    );
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query("SELECT set_config('steamx.allow_steamx_id_change', 'on', true)");
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await db.expectTriggerFailure(
      'UPDATE users SET steamx_id = $1 WHERE id = $2',
      [`U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`, userId],
      'trg_users_immutable_steamx_id',
      'users.steamx_id is immutable',
    );
  });

  it('defers required student and teacher profiles until COMMIT', async () => {
    const studentSchoolCode = `R${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`;
    const schoolId = await db.createSchool({ code: studentSchoolCode });
    const studentSteamxId = `S${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`;
    await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
      steamxId: studentSteamxId,
    });
    await db.expectDeferredCommitFailure(
      'trg_users_require_profile',
      'users.student_profile is required',
    );

    await client.query('ROLLBACK');
    const rolledBackStudent = await client.query('SELECT 1 FROM users WHERE steamx_id = $1', [
      studentSteamxId,
    ]);
    const rolledBackSchool = await client.query('SELECT 1 FROM schools WHERE code = $1', [
      studentSchoolCode,
    ]);
    expect(rolledBackStudent.rowCount).toBe(0);
    expect(rolledBackSchool.rowCount).toBe(0);
    await client.query('BEGIN');
    const teacherSchoolId = await db.createSchool();
    await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId: teacherSchoolId,
    });
    await db.expectDeferredCommitFailure(
      'trg_users_require_profile',
      'users.teacher_profile is required',
    );
  });

  it('rejects deleting a required profile at COMMIT', async () => {
    const studentSchoolId = await db.createSchool();
    const studentSectionId = await db.createClassSection(studentSchoolId);
    const studentId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId: studentSchoolId,
    });
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [studentId, studentSchoolId, studentSectionId],
    );
    await client.query('DELETE FROM student_profiles WHERE user_id = $1', [studentId]);
    await db.expectDeferredCommitFailure(
      'trg_student_profiles_require_user_profile',
      'users.student_profile is required',
    );

    await client.query('ROLLBACK');
    await client.query('BEGIN');
    const schoolId = await db.createSchool();
    const userId = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId,
    });
    await client.query(
      `INSERT INTO teacher_profiles (user_id, school_id, updated_at) VALUES ($1, $2, now())`,
      [userId, schoolId],
    );
    await client.query('DELETE FROM teacher_profiles WHERE user_id = $1', [userId]);
    await db.expectDeferredCommitFailure(
      'trg_teacher_profiles_require_user_profile',
      'users.teacher_profile is required',
    );
  });

  it('allows creating a student user and profile in one transaction', async () => {
    const schoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const userId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
    });
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [userId, schoolId, sectionId],
    );
    await client.query('COMMIT');
    const profiles = await client.query(`SELECT 1 FROM student_profiles WHERE user_id = $1`, [
      userId,
    ]);
    expect(profiles.rowCount).toBe(1);
  });

  it('allows deleting an unprofiled student before COMMIT', async () => {
    const schoolId = await db.createSchool();
    const userId = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
    });
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
  });

  it('checks the current role when a teacher role changes before COMMIT', async () => {
    const schoolId = await db.createSchool();
    const role = await client.query<{ id: number }>(
      `INSERT INTO roles (key, name, user_type)
       VALUES ($1, 'School Staff', 'SCHOOL_STAFF') RETURNING id`,
      [`school-staff-${randomUUID()}`],
    );
    const teacher = await client.query<{ id: string }>(
      `INSERT INTO users
         (id, steamx_id, name, password_hash, role_id, user_type, school_id, updated_at)
       SELECT $1, $2, 'Role Changed User', 'test-hash', id, 'SCHOOL_STAFF', $3, now()
       FROM roles WHERE key = 'teacher'
       RETURNING id`,
      [randomUUID(), `T${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`, schoolId],
    );
    await client.query('UPDATE users SET role_id = $1 WHERE id = $2', [
      db.firstRow(role.rows).id,
      db.firstRow(teacher.rows).id,
    ]);
    await client.query('COMMIT');
    await client.query('DELETE FROM users WHERE id = $1', [db.firstRow(teacher.rows).id]);
    await client.query('DELETE FROM roles WHERE id = $1', [db.firstRow(role.rows).id]);
    await client.query('DELETE FROM schools WHERE id = $1', [schoolId]);
  });
});
