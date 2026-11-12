import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserStatus } from '../../../src/generated/prisma/client.js';
import { loginAsCookie as loginAs } from '../../support/login.js';
import { expectError } from '../../support/expect-error.js';
import {
  createStudentBody,
  createTeacherBody,
  startUsersE2e,
  type UsersE2eContext,
} from '../../support/users-e2e.js';

describe('User read endpoints (e2e)', () => {
  let ctx: UsersE2eContext;
  beforeAll(async () => {
    ctx = await startUsersE2e();
  });
  afterAll(async () => ctx?.close());

  it('requires authentication for listing and viewing users', async () => {
    expectError(await ctx.listUsers(''), 401, 'AUTHENTICATION_FAILED');
    expectError(
      await ctx.getUser('', ctx.fixture.schoolA.teacher.id),
      401,
      'AUTHENTICATION_FAILED',
    );
  });

  it('lets platform staff list users with and without a school filter', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const all = await ctx.listUsers(adminCookie).expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(5);
    expect(all.body.items.map((user: { id: string }) => user.id)).toContain(
      ctx.fixture.schoolA.teacher.id,
    );
    expect(all.body.items.map((user: { id: string }) => user.id)).toContain(
      ctx.fixture.schoolB.teacher.id,
    );
    expect(JSON.stringify(all.body)).not.toContain('passwordHash');

    const schoolA = await ctx
      .listUsers(adminCookie, { schoolId: ctx.fixture.schoolA.school.id })
      .expect(200);
    expect(
      schoolA.body.items.every(
        (user: { schoolId: string }) => user.schoolId === ctx.fixture.schoolA.school.id,
      ),
    ).toBe(true);
    expect(schoolA.body.items.map((user: { id: string }) => user.id)).not.toContain(
      ctx.fixture.schoolB.teacher.id,
    );

    const schoolBUser = await ctx.getUser(adminCookie, ctx.fixture.schoolB.teacher.id).expect(200);
    expect(schoolBUser.body.id).toBe(ctx.fixture.schoolB.teacher.id);
    expect(JSON.stringify(schoolBUser.body)).not.toContain('passwordHash');
  });

  it('filters users by school, role, status, and case-insensitive partial search', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const prefix = `Read${randomUUID().slice(0, 8)}`;
    const email = `${prefix.toLowerCase()}@mailtest.example`;
    const teacher = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, `${prefix} Teacher`, { email }),
      )
      .expect(201);
    ctx.trackUser(teacher.body);
    const student = await ctx
      .createStudent(
        adminCookie,
        createStudentBody(
          ctx.fixture.schoolA.school.id,
          ctx.fixture.schoolA.section.id,
          `${prefix} Student`,
        ),
      )
      .expect(201);
    ctx.trackUser(student.body);
    await ctx.updateUserStatus(adminCookie, teacher.body.id, UserStatus.INACTIVE).expect(200);

    const bySchool = await ctx
      .listUsers(adminCookie, { schoolId: ctx.fixture.schoolA.school.id, q: prefix })
      .expect(200);
    expect(bySchool.body.items.map((user: { id: string }) => user.id)).toEqual(
      expect.arrayContaining([teacher.body.id, student.body.id]),
    );

    const byRole = await ctx.listUsers(adminCookie, { role: 'student', q: prefix }).expect(200);
    expect(byRole.body.items.map((user: { id: string }) => user.id)).toEqual([student.body.id]);

    const byStatus = await ctx
      .listUsers(adminCookie, { status: UserStatus.INACTIVE, q: prefix.toLowerCase() })
      .expect(200);
    expect(byStatus.body.items.map((user: { id: string }) => user.id)).toEqual([teacher.body.id]);

    const byName = await ctx
      .listUsers(adminCookie, { q: `${prefix.toLowerCase()} teacher` })
      .expect(200);
    expect(byName.body.items.map((user: { id: string }) => user.id)).toEqual([teacher.body.id]);
    const bySteamxId = await ctx
      .listUsers(adminCookie, { q: teacher.body.steamxId.toLowerCase().slice(-5) })
      .expect(200);
    expect(bySteamxId.body.items.map((user: { id: string }) => user.id)).toContain(teacher.body.id);
    const byEmail = await ctx.listUsers(adminCookie, { q: 'MAILTEST' }).expect(200);
    expect(byEmail.body.items.map((user: { id: string }) => user.id)).toEqual([teacher.body.id]);
  });

  it('paginates with defaults and maximum size and returns empty beyond the last page', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const prefix = `Page${randomUUID().slice(0, 8)}`;
    const first = await ctx
      .createTeacher(adminCookie, createTeacherBody(ctx.fixture.schoolA.school.id, `${prefix} A`))
      .expect(201);
    ctx.trackUser(first.body);
    const second = await ctx
      .createTeacher(adminCookie, createTeacherBody(ctx.fixture.schoolA.school.id, `${prefix} B`))
      .expect(201);
    ctx.trackUser(second.body);

    const defaults = await ctx.listUsers(adminCookie, { q: prefix }).expect(200);
    expect(defaults.body).toMatchObject({ page: 1, limit: 20, total: 2 });
    const maxSize = await ctx.listUsers(adminCookie, { q: prefix, limit: 100 }).expect(200);
    expect(maxSize.body.limit).toBe(100);
    const beyondEnd = await ctx
      .listUsers(adminCookie, { q: prefix, page: 3, limit: 1 })
      .expect(200);
    expect(beyondEnd.body).toMatchObject({ page: 3, limit: 1, total: 2, items: [] });
    const noMatch = await ctx.listUsers(adminCookie, { q: `no-match-${randomUUID()}` }).expect(200);
    expect(noMatch.body).toMatchObject({ total: 0, items: [] });

    const ordered = await ctx.listUsers(adminCookie, { q: prefix, limit: 100 }).expect(200);
    expect(ordered.body.items.map((user: { id: string }) => user.id)).toEqual(
      [first.body, second.body]
        .sort((left, right) => {
          const timeDifference =
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          return timeDifference || left.id.localeCompare(right.id);
        })
        .map((user) => user.id),
    );
    expect(JSON.stringify(ordered.body)).not.toContain('passwordHash');
  });

  it('limits school callers to their visible users and hides foreign filters and IDs', async () => {
    const teacherCookie = await loginAs(ctx.app, ctx.fixture.schoolA.teacher);
    const own = await ctx.getUser(teacherCookie, ctx.fixture.schoolA.teacher.id).expect(200);
    expect(own.body.id).toBe(ctx.fixture.schoolA.teacher.id);
    expect(JSON.stringify(own.body)).not.toContain('passwordHash');
    expectError(await ctx.getUser(teacherCookie, ctx.fixture.schoolA.student.id), 404, 'NOT_FOUND');
    expectError(await ctx.getUser(teacherCookie, ctx.fixture.schoolB.teacher.id), 404, 'NOT_FOUND');
    expectError(
      await ctx.listUsers(teacherCookie, { schoolId: ctx.fixture.schoolB.school.id }),
      404,
      'NOT_FOUND',
    );
    const ownList = await ctx.listUsers(teacherCookie).expect(200);
    expect(ownList.body.items.map((user: { id: string }) => user.id)).toEqual([
      ctx.fixture.schoolA.teacher.id,
    ]);
    const ownSchoolFilter = await ctx
      .listUsers(teacherCookie, { schoolId: ctx.fixture.schoolA.school.id })
      .expect(200);
    expect(ownSchoolFilter.body.items.map((user: { id: string }) => user.id)).toEqual([
      ctx.fixture.schoolA.teacher.id,
    ]);

    const studentCookie = await loginAs(ctx.app, ctx.fixture.schoolA.student);
    expectError(await ctx.listUsers(studentCookie), 403, 'PERMISSION_REQUIRED');
    expectError(
      await ctx.getUser(studentCookie, ctx.fixture.schoolA.student.id),
      403,
      'PERMISSION_REQUIRED',
    );
  });

  it('rejects malformed IDs and invalid user list filters', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    expectError(await ctx.getUser(adminCookie, 'invalid-id'), 400, 'BAD_REQUEST');

    const invalidQueries: Record<string, string | number>[] = [
      { schoolId: 'invalid-id' },
      { role: 'unknown' },
      { status: 'UNKNOWN' },
      { page: 0 },
      { page: 100001 },
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: 101 },
      { q: 'q'.repeat(101) },
    ];
    for (const query of invalidQueries) {
      expectError(await ctx.listUsers(adminCookie, query), 400, 'VALIDATION_ERROR');
    }
  });
});
