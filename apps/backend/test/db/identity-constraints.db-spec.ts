import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext, type RawDbContext } from '../support/raw-db-context.js';

describe('identity checks and uniqueness', () => {
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

  it('accepts school codes at the two-character and twelve-character boundaries', async () => {
    await db.createSchool({ code: 'A1' });
    await db.createSchool({ code: 'ABCDEFGHIJKL' });
    await db.createSchool({ code: 'AB_C-D12' });
  });

  it.each(['a1', 'A', 'A'.repeat(13), 'A!'])(
    'rejects school code %j unless it is uppercase, allowed, and 2-12 characters',
    async (code) => {
      await db.expectFailure(
        `INSERT INTO schools (id, code, name, city, state, postal_code, country, updated_at)
         VALUES ($1, $2, 'Test School', 'Test City', 'State', '00000', 'Country', now())`,
        [randomUUID(), code],
        { code: '23514', constraint: 'schools_code_fmt' },
      );
    },
  );

  it.each([
    { column: 'name', constraint: 'schools_name_nonempty' },
    { column: 'city', constraint: 'schools_city_nonempty' },
  ])('rejects blank school $column values', async ({ column, constraint }) => {
    const name = column === 'name' ? '   ' : 'Test School';
    const city = column === 'city' ? '   ' : 'Test City';
    await db.expectFailure(
      `INSERT INTO schools (id, code, name, city, state, postal_code, country, updated_at)
       VALUES ($1, $2, $3, $4, 'State', '00000', 'Country', now())`,
      [randomUUID(), `T${randomUUID().slice(0, 10).toUpperCase()}`, name, city],
      { code: '23514', constraint },
    );
  });

  it('accepts normalized school contact email and rejects whitespace or uppercase', async () => {
    await db.createSchool({ contactEmail: 'school@example.test' });
    for (const email of [' School@example.test ', 'school@example.test ']) {
      await db.expectFailure(
        `INSERT INTO schools (id, code, name, city, state, postal_code, country, contact_email, updated_at)
         VALUES ($1, $2, 'Test School', 'Test City', 'State', '00000', 'Country', $3, now())`,
        [randomUUID(), `T${randomUUID().slice(0, 10).toUpperCase()}`, email],
        { code: '23514', constraint: 'schools_contact_email_norm' },
      );
    }
    await db.createSchool({ contactEmail: null });
  });

  it('checks names for non-blank content without normalizing surrounding spaces', async () => {
    await db.createSchool({ name: '  Test School  ', city: '  Test City  ' });
    await db.createUser({ name: '  Test User  ' });
  });

  it('reproduces tab-only names accepted by the database trim checks', async () => {
    const schoolId = await db.createSchool({ name: '\t', city: '\t' });
    await db.createUser({ name: '\t' });
    await db.createClassSection(schoolId, '\t', '\t');
  });

  it.each([
    { id: 'ABC', constraint: null },
    { id: `A${'B'.repeat(31)}`, constraint: null },
    { id: 'AB', constraint: 'users_steamx_id_fmt' },
    { id: 'A'.repeat(33), constraint: 'users_steamx_id_fmt' },
    { id: 'abc123', constraint: 'users_steamx_id_fmt' },
    { id: ' ABC123 ', constraint: 'users_steamx_id_fmt' },
    { id: 'AB!123', constraint: 'users_steamx_id_fmt' },
  ])('checks SteamX ID normalization and length for $id', async ({ id, constraint }) => {
    if (constraint) {
      await db.expectFailure(
        `INSERT INTO users (id, steamx_id, name, password_hash, role_id, user_type, updated_at)
         SELECT $1, $2, 'Test User', 'test-hash', id, 'PLATFORM_STAFF', now()
         FROM roles WHERE key = 'admin'`,
        [randomUUID(), id],
        { code: '23514', constraint },
      );
      return;
    }
    await db.createUser({ steamxId: id });
  });

  it('accepts NULL and normalized user email, but rejects non-normalized email', async () => {
    await db.createUser({ email: null });
    await db.createUser({ email: 'user@example.test' });
    for (const email of ['User@example.test', ' user@example.test ']) {
      await db.expectFailure(
        `INSERT INTO users (id, steamx_id, name, email, password_hash, role_id, user_type, updated_at)
         SELECT $1, $2, 'Test User', $3, 'test-hash', id, 'PLATFORM_STAFF', now()
         FROM roles WHERE key = 'admin'`,
        [randomUUID(), `T${randomUUID().slice(0, 10).toUpperCase()}`, email],
        { code: '23514', constraint: 'users_email_norm' },
      );
    }
  });

  it('requires students to have no email', async () => {
    const schoolId = await db.createSchool();
    await db.expectFailure(
      `INSERT INTO users (id, steamx_id, name, email, password_hash, role_id, user_type, school_id, updated_at)
       SELECT $1, $2, 'Test Student', 'student@example.test', 'test-hash', id, 'STUDENT', $3, now()
       FROM roles WHERE key = 'student'`,
      [randomUUID(), `T${randomUUID().slice(0, 10).toUpperCase()}`, schoolId],
      { code: '23514', constraint: 'users_student_no_email' },
    );
  });

  it('requires non-empty user names while allowing nonblank surrounding spaces', async () => {
    await db.createUser({ name: '  Test User  ' });
    await db.expectFailure(
      `INSERT INTO users (id, steamx_id, name, password_hash, role_id, user_type, updated_at)
       SELECT $1, $2, '  ', 'test-hash', id, 'PLATFORM_STAFF', now()
       FROM roles WHERE key = 'admin'`,
      [randomUUID(), `T${randomUUID().slice(0, 10).toUpperCase()}`],
      { code: '23514', constraint: 'users_name_nonempty' },
    );
  });

  it.each([
    { type: 'PLATFORM_STAFF', schoolId: null },
    { type: 'SCHOOL_STAFF', schoolId: 'school' },
    { type: 'STUDENT', schoolId: 'school' },
  ])('accepts the $type school-scope pairing', async ({ type, schoolId }) => {
    const id = schoolId === 'school' ? await db.createSchool() : null;
    await db.createUser({
      userType: type as 'PLATFORM_STAFF' | 'SCHOOL_STAFF' | 'STUDENT',
      roleKey: type === 'PLATFORM_STAFF' ? 'admin' : type === 'STUDENT' ? 'student' : 'teacher',
      schoolId: id,
    });
  });

  it.each([
    { type: 'PLATFORM_STAFF', hasSchool: true },
    { type: 'SCHOOL_STAFF', hasSchool: false },
    { type: 'STUDENT', hasSchool: false },
  ])('rejects $type with an invalid school-scope pairing', async ({ type, hasSchool }) => {
    const schoolId = hasSchool ? await db.createSchool() : null;
    const roleKey =
      type === 'PLATFORM_STAFF' ? 'admin' : type === 'STUDENT' ? 'student' : 'teacher';
    await db.expectFailure(
      `INSERT INTO users (id, steamx_id, name, password_hash, role_id, user_type, school_id, updated_at)
       SELECT $1, $2, 'Test User', 'test-hash', id, $3, $4, now()
       FROM roles WHERE key = $5`,
      [randomUUID(), `T${randomUUID().slice(0, 10).toUpperCase()}`, type, schoolId, roleKey],
      { code: '23514', constraint: 'users_school_scope' },
    );
  });

  it('accepts only STUDENT profiles for student users', async () => {
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
    await db.expectFailure(
      `INSERT INTO student_profiles (user_id, school_id, user_type, class_section_id, updated_at)
       VALUES ($1, $2, 'SCHOOL_STAFF', $3, now())`,
      [randomUUID(), schoolId, sectionId],
      { code: '23514', constraint: 'student_profiles_type' },
    );
  });

  it('accepts only SCHOOL_STAFF profiles for teacher users', async () => {
    const schoolId = await db.createSchool();
    await db.expectFailure(
      `INSERT INTO teacher_profiles (user_id, school_id, user_type, updated_at)
       VALUES ($1, $2, 'STUDENT', now())`,
      [randomUUID(), schoolId],
      { code: '23514', constraint: 'teacher_profiles_type' },
    );
  });

  it('requires non-empty class and section names without surrounding whitespace', async () => {
    const schoolId = await db.createSchool();
    await db.createClassSection(schoolId, 'Class 5', 'A');
    for (const [className, sectionName] of [
      [' ', 'A'],
      ['Class 5', '  '],
      [' Class 5', 'A'],
      ['Class 5', 'A '],
    ]) {
      await db.expectFailure(
        `INSERT INTO class_sections (id, school_id, class_name, section_name, updated_at)
         VALUES ($1, $2, $3, $4, now())`,
        [randomUUID(), schoolId, className, sectionName],
        { code: '23514', constraint: 'class_sections_names_ok' },
      );
    }
  });

  it('treats school code as unique', async () => {
    const code = `U${randomUUID().slice(0, 10).toUpperCase()}`;
    await db.createSchool({ code });
    await db.expectFailure(
      `INSERT INTO schools (id, code, name, city, state, postal_code, country, updated_at)
       VALUES ($1, $2, 'Other School', 'City', 'State', '00000', 'Country', now())`,
      [randomUUID(), code],
      { code: '23505', constraint: 'schools_code_key' },
    );
  });

  it('treats SteamX ID and non-null email as unique while allowing multiple NULL emails', async () => {
    const steamxId = `U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`;
    const email = `${randomUUID()}@example.test`;
    await db.createUser({ steamxId, email });
    await db.createUser({ email: null });
    await db.createUser({ email: null });
    for (const [field, value, constraint] of [
      ['steamx_id', steamxId, 'users_steamx_id_key'],
      ['email', email, 'users_email_key'],
    ]) {
      await db.expectFailure(
        `INSERT INTO users (id, steamx_id, name, email, password_hash, role_id, user_type, updated_at)
         SELECT $1, $2, 'Test User', $3, 'test-hash', id, 'PLATFORM_STAFF', now()
         FROM roles WHERE key = 'admin'`,
        [
          randomUUID(),
          field === 'steamx_id'
            ? value
            : `U${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`,
          field === 'email' ? value : null,
        ],
        { code: '23505', constraint },
      );
    }
  });

  it('treats class, section, and school names as case-insensitively unique', async () => {
    const schoolId = await db.createSchool();
    await db.createClassSection(schoolId, 'Class 5', 'A');
    await db.expectFailure(
      `INSERT INTO class_sections (id, school_id, class_name, section_name, updated_at)
       VALUES ($1, $2, 'cLaSs 5', 'a', now())`,
      [randomUUID(), schoolId],
      { code: '23505', constraint: 'class_sections_school_names_uq' },
    );
    const otherSchoolId = await db.createSchool();
    await db.createClassSection(otherSchoolId, 'class 5', 'a');
  });
});
