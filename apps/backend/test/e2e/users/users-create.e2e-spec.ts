import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { UserType } from '../../../src/generated/prisma/client.js';
import { SteamxIdService } from '../../../src/users/steamx-id/steamx-id.service.js';
import { loginAsCookie as loginAs } from '../../support/login.js';
import { expectError } from '../../support/expect-error.js';
import {
  createStudentBody,
  createTeacherBody,
  startUsersE2e,
  type UsersE2eContext,
} from '../../support/users-e2e.js';

describe('User creation endpoints (e2e)', () => {
  let ctx: UsersE2eContext;
  beforeAll(async () => {
    ctx = await startUsersE2e();
  });
  afterAll(async () => ctx?.close());

  it('creates users and matching profiles in one response without exposing password hashes', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, '  Ada Lovelace  ', {
          email: '  ADA@EXAMPLE.COM ',
          primaryAssignment: '  Mathematics  ',
        }),
      )
      .expect(201);
    ctx.trackUser(teacher.body);
    expect(teacher.body).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      userType: UserType.SCHOOL_STAFF,
      schoolId: ctx.fixture.schoolA.school.id,
      mustChangePassword: true,
      profile: { primaryAssignment: 'Mathematics' },
    });
    expect(teacher.body.steamxId).toMatch(
      new RegExp(`^${ctx.fixture.schoolA.school.code}-[A-Z]{4,8}[0-9]{3}$`),
    );
    expect(JSON.stringify(teacher.body)).not.toContain('passwordHash');

    const student = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          'Student Example',
          { guardianName: '  Parent Example  ' },
        ),
      )
      .expect(201);
    ctx.trackUser(student.body);
    expect(student.body).toMatchObject({
      userType: UserType.STUDENT,
      mustChangePassword: true,
      profile: {
        guardianName: 'Parent Example',
        classSectionId: ctx.fixture.schoolA.section.id,
      },
    });
    expect(JSON.stringify(student.body)).not.toContain('passwordHash');

    await expect(
      ctx.prisma.teacherProfile.findUnique({ where: { userId: teacher.body.id } }),
    ).resolves.toMatchObject({ schoolId: ctx.fixture.schoolA.school.id });
    await expect(
      ctx.prisma.studentProfile.findUnique({ where: { userId: student.body.id } }),
    ).resolves.toMatchObject({ schoolId: ctx.fixture.schoolA.school.id });
  });

  it.each([
    ['short name', 'Li', /^LI[A-Z]{2}[0-9]{3}$/],
    ['single name', 'Madonna', /^MADONNA[0-9]{3}$/],
    ['honorific', 'Dr Ada Lovelace', /^ADAL[0-9]{3}$/],
    ['non-Latin name', '東京', /^[A-Z]{4}[0-9]{3}$/],
  ])('generates a correctly formatted SteamX ID for a %s', async (_caseName, name, pattern) => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const created = await ctx
      .createTeacher(adminCookie, createTeacherBody(ctx.fixture.schoolA.school.id, name))
      .expect(201);
    ctx.trackUser(created.body);
    const idPattern = pattern.source.replace(/^\^|\$$/g, '');
    expect(created.body.steamxId).toMatch(
      new RegExp(`^${ctx.fixture.schoolA.school.code}-${idPattern}$`),
    );
  });

  it('retries a SteamX ID collision without returning the rejected candidate', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const rejected = ctx.fixture.schoolA.teacher.steamxId;
    const accepted = `${ctx.fixture.schoolA.school.code}-RETRYN042`;
    const service = ctx.app.get(SteamxIdService);
    const generator = vi.spyOn(
      service as unknown as {
        generateCandidate: (schoolCode: string, name: string) => string;
      },
      'generateCandidate',
    );
    generator.mockReturnValueOnce(rejected).mockReturnValueOnce(accepted);

    try {
      const response = await ctx
        .createTeacher(
          adminCookie,
          createTeacherBody(ctx.fixture.schoolA.school.id, 'Collision Case'),
        )
        .expect(201);
      ctx.trackUser(response.body);
      expect(generator).toHaveBeenCalledTimes(2);
      expect(response.body.steamxId).toBe(accepted);
      expect(JSON.stringify(response.body)).not.toContain(rejected);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    } finally {
      generator.mockRestore();
    }
  });

  it('creates an account whose initial password works and requires a password change', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const created = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Initial Login User'),
      )
      .expect(201);
    ctx.trackUser(created.body);

    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ctx.origin)
      .send({ steamxId: created.body.steamxId, password: 'Tenancy test password 2026!' })
      .expect(200);
    expect(login.body.mustChangePassword).toBe(true);
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');
  });

  it('rejects teacher and student creates without authentication', async () => {
    const body = createTeacherBody(ctx.fixture.schoolA.school.id);
    expectError(await ctx.createTeacher('', body), 401, 'AUTHENTICATION_FAILED');
    expectError(
      await ctx.createStudent(
        '',
        createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
      ),
      401,
      'AUTHENTICATION_FAILED',
    );
  });

  it('allows teachers to create only in their own school and denies student creation', async () => {
    const teacherCookie = await loginAs(ctx.app, ctx.fixture.schoolA.teacher);
    const own = await ctx
      .createTeacher(
        teacherCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Teacher Created User'),
      )
      .expect(201);
    ctx.trackUser(own.body);

    expectError(
      await ctx.createTeacher(
        teacherCookie,
        createTeacherBody(ctx.fixture.schoolB.school.id, 'Foreign Teacher'),
      ),
      404,
      'NOT_FOUND',
    );
    expectError(
      await ctx.createStudent(
        teacherCookie,
        createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
      ),
      403,
      'PERMISSION_REQUIRED',
    );
    const studentCookie = await loginAs(ctx.app, ctx.fixture.schoolA.student);
    expectError(
      await ctx.createTeacher(studentCookie, createTeacherBody(ctx.fixture.schoolA.school.id)),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(
      await ctx.createStudent(
        studentCookie,
        createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
      ),
      403,
      'PERMISSION_REQUIRED',
    );
  });

  it('requires a selected active school and a class section belonging to that school', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    expectError(
      await ctx.createTeacher(adminCookie, {
        name: 'No school selected',
        password: 'Tenancy test password 2026!',
      }),
      400,
      'SCHOOL_REQUIRED',
    );
    expectError(
      await ctx.createTeacher(adminCookie, createTeacherBody(randomUUID(), 'Unknown School')),
      404,
      'NOT_FOUND',
    );
    expectError(
      await ctx.createStudent(adminCookie, {
        name: 'No student school',
        password: 'Tenancy test password 2026!',
        classSectionId: ctx.fixture.schoolA.section.id,
      }),
      400,
      'SCHOOL_REQUIRED',
    );
    expectError(
      await ctx.createStudent(
        adminCookie,
        createStudentBody(randomUUID(), ctx.fixture.schoolA.section.id, 'Unknown Student School'),
      ),
      404,
      'NOT_FOUND',
    );
    await ctx.prisma.school.update({
      where: { id: ctx.fixture.schoolA.school.id },
      data: { status: 'INACTIVE' },
    });
    try {
      expectError(
        await ctx.createTeacher(adminCookie, createTeacherBody(ctx.fixture.schoolA.school.id)),
        409,
        'SCHOOL_INACTIVE',
      );
      expectError(
        await ctx.createStudent(
          adminCookie,
          createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        ),
        409,
        'SCHOOL_INACTIVE',
      );
    } finally {
      await ctx.prisma.school.update({
        where: { id: ctx.fixture.schoolA.school.id },
        data: { status: 'ACTIVE' },
      });
    }

    expectError(
      await ctx.createStudent(
        adminCookie,
        createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolB.section.id),
      ),
      404,
      'NOT_FOUND',
    );
  });

  it('validates required fields, types, boundaries, password policy, and unknown fields', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const teacherBody = createTeacherBody(ctx.fixture.schoolA.school.id);
    const invalidTeachers: object[] = [
      { ...teacherBody, name: undefined },
      { ...teacherBody, name: '   ' },
      { ...teacherBody, name: 12 },
      { ...teacherBody, name: 'N'.repeat(121) },
      { ...teacherBody, email: 'not-email' },
      { ...teacherBody, email: 4 },
      {
        ...teacherBody,
        email: 'a'.repeat(64) + '@' + 'd'.repeat(63) + '.' + 'e'.repeat(63) + '.' + 'f'.repeat(62),
      },
      { ...teacherBody, primaryAssignment: 4 },
      { ...teacherBody, primaryAssignment: 'A'.repeat(121) },
      { ...teacherBody, schoolId: 'bad-id' },
      { ...teacherBody, extra: true },
      { ...teacherBody, password: undefined },
      { ...teacherBody, password: 42 },
      { ...teacherBody, password: 'P'.repeat(101) },
    ];
    for (const body of invalidTeachers) {
      expectError(await ctx.createTeacher(adminCookie, body), 400, 'VALIDATION_ERROR');
    }
    for (const password of ['short', ' password with spaces ']) {
      expectError(
        await ctx.createTeacher(adminCookie, { ...teacherBody, password }),
        400,
        'PASSWORD_POLICY',
      );
    }

    const invalidStudents: object[] = [
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        name: undefined,
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        name: '   ',
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        name: 4,
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        name: 'N'.repeat(121),
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        classSectionId: undefined,
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        classSectionId: 'bad-id',
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        schoolId: 'bad-id',
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        password: undefined,
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        password: 4,
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        password: 'P'.repeat(101),
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        guardianName: 2,
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        guardianName: 'G'.repeat(121),
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        email: 'student@example.com',
      },
      {
        ...createStudentBody(ctx.fixture.schoolA.school.id, ctx.fixture.schoolA.section.id),
        extra: true,
      },
    ];
    for (const body of invalidStudents) {
      expectError(await ctx.createStudent(adminCookie, body), 400, 'VALIDATION_ERROR');
    }
  });

  it('accepts maximum field lengths and nullable optional values', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const longEmail = `${'a'.repeat(64)}@${'d'.repeat(63)}.${'e'.repeat(63)}.${'f'.repeat(61)}`;
    expect(longEmail).toHaveLength(254);
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'N'.repeat(120), {
          password: 'P'.repeat(100),
          email: longEmail,
          primaryAssignment: 'A'.repeat(120),
        }),
      )
      .expect(201);
    ctx.trackUser(teacher.body);
    expect(teacher.body.name).toHaveLength(120);
    expect(teacher.body.email).toBe(longEmail);
    expect(teacher.body.profile.primaryAssignment).toHaveLength(120);
    expect(JSON.stringify(teacher.body)).not.toContain('passwordHash');

    const nullableTeacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Nullable Fields', {
          email: null,
          primaryAssignment: null,
        }),
      )
      .expect(201);
    ctx.trackUser(nullableTeacher.body);
    expect(nullableTeacher.body).toMatchObject({
      email: null,
      profile: { primaryAssignment: null },
    });

    const student = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          'N'.repeat(120),
          { guardianName: 'G'.repeat(120) },
        ),
      )
      .expect(201);
    ctx.trackUser(student.body);
    expect(student.body.name).toHaveLength(120);
    expect(student.body.profile.guardianName).toHaveLength(120);

    const nullableStudent = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          'Nullable Guardian',
          {
            guardianName: null,
          },
        ),
      )
      .expect(201);
    ctx.trackUser(nullableStudent.body);
    expect(nullableStudent.body.profile.guardianName).toBeNull();
  });

  it('rejects duplicate teacher email and rolls back both account types on profile failure', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const email = `duplicate-${randomUUID()}@example.com`;
    const first = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Email Owner', { email }),
      )
      .expect(201);
    ctx.trackUser(first.body);
    expectError(
      await ctx.createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Duplicate Email', { email }),
      ),
      409,
      'CONFLICT',
    );

    const suffix = randomUUID().replaceAll('-', '');
    const triggerName = `fail_teacher_profile_${suffix}`;
    const functionName = `fail_teacher_profile_fn_${suffix}`;
    const rollbackEmail = `rollback-${suffix}@example.com`;
    try {
      await ctx.setupClient.$executeRawUnsafe(
        `CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.primary_assignment = '__PROFILE_FAILURE__' THEN RAISE EXCEPTION 'profile insert failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`,
      );
      await ctx.setupClient.$executeRawUnsafe(
        `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON teacher_profiles FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
      );
      const failed = await ctx
        .createTeacher(
          adminCookie,
          createTeacherBody(ctx.fixture.schoolA.school.id, 'Rollback User', {
            email: rollbackEmail,
            primaryAssignment: '__PROFILE_FAILURE__',
          }),
        )
        .expect(500);
      expect(JSON.stringify(failed.body)).not.toContain('passwordHash');
      await expect(
        ctx.prisma.user.findUnique({ where: { email: rollbackEmail } }),
      ).resolves.toBeNull();
    } finally {
      await ctx.setupClient.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON teacher_profiles`,
      );
      await ctx.setupClient.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    const studentSuffix = randomUUID().replaceAll('-', '');
    const studentTrigger = `fail_student_profile_${studentSuffix}`;
    const studentFunction = `fail_student_profile_fn_${studentSuffix}`;
    const studentName = `Rollback Student ${studentSuffix}`;
    try {
      await ctx.setupClient.$executeRawUnsafe(
        `CREATE FUNCTION "${studentFunction}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.guardian_name = '__PROFILE_FAILURE__' THEN RAISE EXCEPTION 'profile insert failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`,
      );
      await ctx.setupClient.$executeRawUnsafe(
        `CREATE TRIGGER "${studentTrigger}" BEFORE INSERT ON student_profiles FOR EACH ROW EXECUTE FUNCTION "${studentFunction}"()`,
      );
      const failedStudent = await ctx
        .createStudent(
          adminCookie,
          createStudentBody(
            ctx.fixture.schoolA.school.id,
            ctx.fixture.schoolA.section.id,
            studentName,
            { guardianName: '__PROFILE_FAILURE__' },
          ),
        )
        .expect(500);
      expect(JSON.stringify(failedStudent.body)).not.toContain('passwordHash');
      await expect(ctx.prisma.user.findFirst({ where: { name: studentName } })).resolves.toBeNull();
    } finally {
      await ctx.setupClient.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${studentTrigger}" ON student_profiles`,
      );
      await ctx.setupClient.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${studentFunction}"()`);
    }
  });
});
