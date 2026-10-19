import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loginAsCookie as loginAs } from '../../support/login.js';
import { expectError } from '../../support/expect-error.js';
import { createTeacherBody, startUsersE2e, type UsersE2eContext } from '../../support/users-e2e.js';
import { TENANCY_TEST_PASSWORD } from '../../support/factories/fixtures.js';

describe('User SteamX ID rename endpoint (e2e)', () => {
  let ctx: UsersE2eContext;
  beforeAll(async () => {
    ctx = await startUsersE2e();
  });
  afterAll(async () => ctx?.close());

  it('requires authentication to rename a SteamX ID', async () => {
    expectError(
      await ctx.renameSteamxId('', ctx.fixture.schoolA.teacher.id, 'TST-RENAMED001'),
      401,
      'UNAUTHORIZED',
    );
  });

  it('renames a school user, normalizes the ID, and keeps the existing session valid', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const target = await ctx
      .createTeacher(adminCookie, createTeacherBody(ctx.fixture.schoolA.school.id, 'Rename Target'))
      .expect(201);
    ctx.trackUser(target.body);
    await ctx.prisma.user.update({
      where: { id: target.body.id },
      data: { mustChangePassword: false },
    });
    const targetCookie = await loginAs(ctx.app, {
      steamxId: target.body.steamxId,
      password: TENANCY_TEST_PASSWORD,
    });
    const renamedId = `${ctx.fixture.schoolA.school.code}-RENAMED001`;

    const result = await ctx
      .renameSteamxId(adminCookie, target.body.id, ` ${renamedId.toLowerCase()} `)
      .expect(200);
    expect(result.body.steamxId).toBe(renamedId);
    expect(JSON.stringify(result.body)).not.toContain('passwordHash');
    await ctx.getUser(targetCookie, target.body.id).expect(200);

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ctx.origin)
      .send({ steamxId: target.body.steamxId, password: TENANCY_TEST_PASSWORD })
      .expect(401);
    const newLogin = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ctx.origin)
      .send({ steamxId: renamedId, password: TENANCY_TEST_PASSWORD })
      .expect(200);
    expect(JSON.stringify(newLogin.body)).not.toContain('passwordHash');
  });

  it('rejects invalid, empty, oversized, or already-used SteamX IDs', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const target = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Rename Validation Target'),
      )
      .expect(201);
    ctx.trackUser(target.body);
    const other = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Existing ID Target'),
      )
      .expect(201);
    ctx.trackUser(other.body);

    for (const invalid of [
      'OTHER-VALID001',
      `${ctx.fixture.schoolA.school.code}-BAD1`,
      `${ctx.fixture.schoolA.school.code}-TOOLONGNAME001`,
    ]) {
      expectError(
        await ctx.renameSteamxId(adminCookie, target.body.id, invalid),
        400,
        'INVALID_STEAMX_ID',
      );
    }
    for (const body of [
      { steamxId: '' },
      { steamxId: 4 },
      { steamxId: 'X'.repeat(33) },
      { extra: true },
    ]) {
      const response = await request(ctx.app.getHttpServer())
        .patch(`/api/v1/users/${target.body.id}/steamx-id`)
        .set('Origin', ctx.origin)
        .set('Cookie', adminCookie)
        .send(body)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    }
    expectError(
      await ctx.renameSteamxId(adminCookie, target.body.id, other.body.steamxId),
      409,
      'STEAMX_ID_TAKEN',
    );
  });

  it('allows a granted school user to rename its own ID but hides foreign targets', async () => {
    const teacherCookie = await loginAs(ctx.app, ctx.fixture.schoolA.teacher);
    const ownId = `${ctx.fixture.schoolA.school.code}-TEACHER001`;
    const own = await ctx
      .renameSteamxId(teacherCookie, ctx.fixture.schoolA.teacher.id, ownId)
      .expect(200);
    expect(own.body.steamxId).toBe(ownId);
    expectError(
      await ctx.renameSteamxId(
        teacherCookie,
        ctx.fixture.schoolB.teacher.id,
        `${ctx.fixture.schoolB.school.code}-FOREIGN001`,
      ),
      404,
      'NOT_FOUND',
    );

    const studentCookie = await loginAs(ctx.app, ctx.fixture.schoolA.student);
    expectError(
      await ctx.renameSteamxId(
        studentCookie,
        ctx.fixture.schoolA.student.id,
        `${ctx.fixture.schoolA.school.code}-STUDENT001`,
      ),
      403,
      'FORBIDDEN',
    );
  });

  it('rejects platform-staff targets and malformed or missing target IDs', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const prefix = ctx.fixture.schoolA.school.code;
    expectError(
      await ctx.renameSteamxId(adminCookie, ctx.fixture.admin.id, `${prefix}-ADMIN001`),
      400,
      'STEAMX_ID_NOT_RENAMABLE',
    );
    expectError(
      await ctx.renameSteamxId(adminCookie, 'invalid-id', `${prefix}-MISSING001`),
      400,
      'BAD_REQUEST',
    );
    expectError(
      await ctx.renameSteamxId(adminCookie, randomUUID(), `${prefix}-MISSING001`),
      404,
      'NOT_FOUND',
    );
  });

  it('does not allow SteamX ID changes through the general update endpoint', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const target = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'Immutable Endpoint Target'),
      )
      .expect(201);
    ctx.trackUser(target.body);

    expectError(
      await ctx.updateUser(adminCookie, target.body.id, {
        steamxId: `${ctx.fixture.schoolA.school.code}-BYPASS001`,
      }),
      400,
      'VALIDATION_ERROR',
    );
    const unchanged = await ctx.getUser(adminCookie, target.body.id).expect(200);
    expect(unchanged.body.steamxId).toBe(target.body.steamxId);
    expect(JSON.stringify(unchanged.body)).not.toContain('passwordHash');
  });

  it('returns the same result when the current valid SteamX ID is submitted again', async () => {
    const adminCookie = await loginAs(ctx.app, ctx.fixture.admin);
    const target = await ctx
      .createTeacher(
        adminCookie,
        createTeacherBody(ctx.fixture.schoolA.school.id, 'No-op Rename Target'),
      )
      .expect(201);
    ctx.trackUser(target.body);
    const current = target.body.steamxId as string;
    const response = await ctx.renameSteamxId(adminCookie, target.body.id, current).expect(200);
    expect(response.body.steamxId).toBe(current);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });
});
