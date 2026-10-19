import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserType } from '../../../src/generated/prisma/client.js';
import { createTestUser } from '../../support/factories/fixtures.js';
import { loginAsCookie as loginAs } from '../../support/login.js';
import { expectError } from '../../support/expect-error.js';
import {
  createStudentBody,
  createTeacherBody,
  startUsersE2e,
  type UsersE2eContext,
} from '../../support/users-e2e.js';

describe('User update endpoint (e2e)', () => {
  let ctx: UsersE2eContext;
  beforeAll(async () => {
    ctx = await startUsersE2e();
  });
  afterAll(async () => ctx?.close());

  it('requires authentication to update a user', async () => {
    expectError(
      await ctx.updateUser('', ctx.fixture.schoolA.teacher.id, { name: 'Unauthorized' }),
      401,
      'UNAUTHORIZED',
    );
  });

  it('trims and normalizes applicable teacher fields and accepts nullable profile values', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const prefix = randomUUID().replaceAll('-', '').slice(0, 8).toLowerCase();
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Editable Teacher', {
          email: `${prefix}@example.com`,
          primaryAssignment: 'Original',
        }),
      )
      .expect(201);
    ctx.trackUser(teacher.body);

    const updated = await ctx
      .updateUser(adminCookie, teacher.body.id, {
        name: '  Updated Teacher  ',
        email: `  UPDATED-${prefix.toUpperCase()}@EXAMPLE.COM  `,
        primaryAssignment: '  Science  ',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Updated Teacher',
      email: `updated-${prefix}@example.com`,
      profile: { primaryAssignment: 'Science' },
    });
    expect(JSON.stringify(updated.body)).not.toContain('passwordHash');

    const cleared = await ctx
      .updateUser(adminCookie, teacher.body.id, {
        email: null,
        primaryAssignment: null,
      })
      .expect(200);
    expect(cleared.body).toMatchObject({
      email: null,
      profile: { primaryAssignment: null },
    });
  });

  it('updates student profile fields and permits a class change within its school', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const student = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          'Editable Student',
          { guardianName: 'Original Guardian' },
        ),
      )
      .expect(201);
    ctx.trackUser(student.body);
    const nextSection = await ctx.prisma.classSection.create({
      data: {
        schoolId: ctx.fixture.schoolA.school.id,
        className: `Move ${randomUUID().slice(0, 8)}`,
      },
    });
    ctx.createdClassSectionIds.push(nextSection.id);

    const updated = await ctx
      .updateUser(adminCookie, student.body.id, {
        guardianName: '  New Guardian  ',
        classSectionId: nextSection.id,
      })
      .expect(200);
    expect(updated.body.profile).toEqual({
      guardianName: 'New Guardian',
      classSectionId: nextSection.id,
    });
    expect(JSON.stringify(updated.body)).not.toContain('passwordHash');

    const cleared = await ctx
      .updateUser(adminCookie, student.body.id, { guardianName: null })
      .expect(200);
    expect(cleared.body.profile.guardianName).toBeNull();
  });

  it('rejects empty, unknown, wrongly typed, blank, and overlong updates', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Validation Target'),
      )
      .expect(201);
    ctx.trackUser(teacher.body);

    const invalidBodies: object[] = [
      {},
      { unexpected: true },
      { name: null },
      { name: 4 },
      { name: '   ' },
      { name: 'N'.repeat(121) },
      { email: 'invalid-email' },
      { email: `x${'a'.repeat(244)}@example.com` },
      { primaryAssignment: 2 },
      { primaryAssignment: 'A'.repeat(121) },
      { classSectionId: 'not-a-uuid' },
    ];
    for (const body of invalidBodies) {
      const response = await ctx.updateUser(adminCookie, teacher.body.id, body).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    }
  });

  it('rejects fields that do not apply to a teacher or student', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Wrong Field Teacher'),
      )
      .expect(201);
    ctx.trackUser(teacher.body);
    const student = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          'Wrong Field Student',
        ),
      )
      .expect(201);
    ctx.trackUser(student.body);

    expectError(
      await ctx.updateUser(adminCookie, teacher.body.id, { guardianName: null }),
      400,
      'FIELD_NOT_APPLICABLE',
    );
    expectError(
      await ctx.updateUser(adminCookie, teacher.body.id, {
        classSectionId: ctx.fixture.schoolA.section.id,
      }),
      400,
      'FIELD_NOT_APPLICABLE',
    );
    expectError(
      await ctx.updateUser(adminCookie, student.body.id, { email: null }),
      400,
      'FIELD_NOT_APPLICABLE',
    );
    expectError(
      await ctx.updateUser(adminCookie, student.body.id, { primaryAssignment: null }),
      400,
      'FIELD_NOT_APPLICABLE',
    );
  });

  it('returns success without changing values when an update repeats current values', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Unchanged Teacher', {
          email: 'unchanged@example.com',
          primaryAssignment: 'History',
        }),
      )
      .expect(201);
    ctx.trackUser(teacher.body);

    const repeated = await ctx
      .updateUser(adminCookie, teacher.body.id, {
        name: teacher.body.name,
        email: teacher.body.email,
        primaryAssignment: teacher.body.profile.primaryAssignment,
      })
      .expect(200);
    expect(repeated.body).toMatchObject({
      name: 'Unchanged Teacher',
      email: 'unchanged@example.com',
      profile: { primaryAssignment: 'History' },
    });
  });

  it('rejects duplicate emails and class sections from another school without changing data', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
    const owner = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Email Owner', {
          email: `${suffix}@example.com`,
        }),
      )
      .expect(201);
    ctx.trackUser(owner.body);
    const target = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Email Target', {
          email: `target-${suffix}@example.com`,
        }),
      )
      .expect(201);
    ctx.trackUser(target.body);
    const student = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          'Class Target',
        ),
      )
      .expect(201);
    ctx.trackUser(student.body);

    expectError(
      await ctx.updateUser(adminCookie, target.body.id, { email: owner.body.email }),
      409,
      'CONFLICT',
    );
    const before = await ctx.prisma.studentProfile.findUniqueOrThrow({
      where: { userId: student.body.id },
      select: { classSectionId: true },
    });
    expectError(
      await ctx.updateUser(adminCookie, student.body.id, {
        classSectionId: ctx.fixture.schoolB.section.id,
      }),
      404,
      'NOT_FOUND',
    );
    await expect(
      ctx.prisma.studentProfile.findUniqueOrThrow({
        where: { userId: student.body.id },
        select: { classSectionId: true },
      }),
    ).resolves.toEqual(before);
  });

  it('hides foreign updates from school staff and denies students', async () => {
    const teacherCookie = await loginAs(ctx.app, ctx.fixture.schoolA.teacher);
    const own = await ctx
      .updateUser(teacherCookie, ctx.fixture.schoolA.teacher.id, {
        name: 'Own Teacher Updated',
      })
      .expect(200);
    expect(own.body.name).toBe('Own Teacher Updated');
    expectError(
      await ctx.updateUser(teacherCookie, ctx.fixture.schoolB.teacher.id, {
        name: 'Foreign update',
      }),
      404,
      'NOT_FOUND',
    );

    const studentCookie = await loginAs(ctx.app, ctx.fixture.schoolA.student);
    expectError(
      await ctx.updateUser(studentCookie, ctx.fixture.schoolA.student.id, {
        name: 'Student update',
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('rejects platform-staff targets and malformed or missing IDs', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const platformStaff = await ctx.prisma.$transaction((tx) =>
      createTestUser(tx, {
        userType: UserType.PLATFORM_STAFF,
        name: 'Protected Platform User',
        passwordHash: 'test-only-password-hash',
      }),
    );
    ctx.trackUser(platformStaff);

    expectError(
      await ctx.updateUser(adminCookie, platformStaff.id, { name: 'No update' }),
      400,
      'USER_NOT_MANAGEABLE',
    );
    expectError(
      await ctx.updateUser(adminCookie, 'not-a-uuid', { name: 'Invalid ID' }),
      400,
      'BAD_REQUEST',
    );
    expectError(
      await ctx.updateUser(adminCookie, randomUUID(), { name: 'Missing target' }),
      404,
      'NOT_FOUND',
    );
  });
});
