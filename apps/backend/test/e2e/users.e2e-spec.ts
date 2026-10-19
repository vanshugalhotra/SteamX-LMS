/**
 * Checks user creation, visibility, school scope, and profile transaction behavior.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { Env } from '../../src/config/env.schema.js';
import { configureApp } from '../../src/configure-app.js';
import {
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { SteamxIdService } from '../../src/users/steamx-id/steamx-id.service.js';
import {
  createTestUser,
  createTwoSchoolFixture,
  TENANCY_TEST_PASSWORD,
  type TwoSchoolFixture,
} from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie as loginAs } from '../support/login.js';

describe('Users endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let revokeTeacherPermissions: (() => Promise<void>) | undefined;
  const createdUserIds: string[] = [];
  const createdClassSectionIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Users e2e tests require DATABASE_URL.');
    }

    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const grant = await grantPermissions(setupClient, 'teacher', [
      PERMISSION.USER_READ,
      PERMISSION.USER_CREATE_TEACHER,
      PERMISSION.USER_STEAMX_ID_UPDATE,
      PERMISSION.USER_UPDATE,
      PERMISSION.USER_DEACTIVATE,
      PERMISSION.USER_PASSWORD_RESET,
    ]);
    revokeTeacherPermissions = grant.revoke;

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Users e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupFixtures(
        prisma,
        [
          fixture.admin.id,
          fixture.schoolA.teacher.id,
          fixture.schoolA.student.id,
          fixture.schoolB.teacher.id,
          fixture.schoolB.student.id,
          ...createdUserIds,
        ],
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id, ...createdClassSectionIds],
      );
    }
    await app?.close();
    await revokeTeacherPermissions?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function createTeacher(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/users/teachers')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function createStudent(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/users/students')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function listUsers(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer()).get('/api/v1/users').set('Cookie', cookie).query(query);
  }

  function getUser(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/v1/users/${id}`).set('Cookie', cookie);
  }

  function renameSteamxId(cookie: string, id: string, steamxId: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}/steamx-id`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ steamxId });
  }

  function updateUser(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function updateUserStatus(cookie: string, id: string, status: UserStatus) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${id}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  function resetUserPassword(cookie: string, id: string, newPassword: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/users/${id}/reset-password`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ newPassword });
  }

  async function createAndTrackTeacher(
    cookie: string,
    name: string,
    schoolId: string,
    fields: Record<string, unknown> = {},
  ) {
    const response = await createTeacher(cookie, {
      name,
      password: TENANCY_TEST_PASSWORD,
      schoolId,
      ...fields,
    }).expect(201);
    createdUserIds.push(response.body.id as string);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    return response.body as {
      id: string;
      steamxId: string;
      name: string;
      email: string | null;
      status: string;
      role: { key: string; name: string };
      userType: string;
      schoolId: string;
      createdAt: string;
      mustChangePassword: boolean;
      profile: { primaryAssignment: string | null };
    };
  }

  it('creates teacher and student accounts with normalized fields and profile details', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const uniqueName = `TEN4 ${randomUUID().slice(0, 8)}`;
    const emailPrefix = uniqueName.replace(' ', '').toLowerCase();
    const teacher = await createAndTrackTeacher(
      adminCookie,
      `  ${uniqueName} Teacher  `,
      fixture.schoolA.school.id,
      {
        email: `  ${emailPrefix}@example.com  `,
        primaryAssignment: '  Mathematics  ',
      },
    );

    expect(teacher.name).toBe(`${uniqueName} Teacher`);
    expect(teacher.email).toBe(`${emailPrefix}@example.com`);
    expect(teacher.steamxId).toMatch(
      new RegExp(`^${fixture.schoolA.school.code}-[A-Z]{4,8}[0-9]{3}$`),
    );
    expect(teacher.role).toEqual({ key: 'teacher', name: 'Teacher' });
    expect(teacher.userType).toBe(UserType.SCHOOL_STAFF);
    expect(teacher.schoolId).toBe(fixture.schoolA.school.id);
    expect(teacher.mustChangePassword).toBe(true);
    expect(teacher.profile).toEqual({ primaryAssignment: 'Mathematics' });

    await createStudent(adminCookie, {
      name: `${uniqueName} Invalid student`,
      password: TENANCY_TEST_PASSWORD,
      classSectionId: fixture.schoolA.section.id,
      schoolId: fixture.schoolA.school.id,
      email: `${emailPrefix}@example.com`,
    }).expect(400);

    const studentResponse = await createStudent(adminCookie, {
      name: `${uniqueName} Student`,
      password: TENANCY_TEST_PASSWORD,
      classSectionId: fixture.schoolA.section.id,
      schoolId: fixture.schoolA.school.id,
      guardianName: '  Parent Name  ',
    }).expect(201);
    createdUserIds.push(studentResponse.body.id as string);
    expect(JSON.stringify(studentResponse.body)).not.toContain('passwordHash');
    expect(studentResponse.body.steamxId).toMatch(
      new RegExp(`^${fixture.schoolA.school.code}-[A-Z]{4,8}[0-9]{3}$`),
    );
    expect(studentResponse.body).toMatchObject({
      role: { key: 'student', name: 'Student' },
      userType: UserType.STUDENT,
      mustChangePassword: true,
      profile: {
        guardianName: 'Parent Name',
        classSectionId: fixture.schoolA.section.id,
      },
    });
  });

  it('retries a steamx_id collision and creates the user with the next candidate', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const retryCandidate = `${fixture.schoolA.school.code}-RETRYN042`;
    const steamxIds = app.get(SteamxIdService) as unknown as {
      generateCandidate(schoolCode: string, name: string): string;
    };
    const candidateSpy = vi.spyOn(steamxIds, 'generateCandidate');
    candidateSpy
      .mockReturnValueOnce(fixture.schoolA.teacher.steamxId)
      .mockReturnValueOnce(retryCandidate);

    try {
      const teacher = await createAndTrackTeacher(
        adminCookie,
        'Collision Retry',
        fixture.schoolA.school.id,
      );
      expect(teacher.steamxId).toBe(retryCandidate);
    } finally {
      candidateSpy.mockRestore();
    }
  });

  it('returns a clear service error after three SteamX ID collisions', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const steamxIds = app.get(SteamxIdService) as unknown as {
      generateCandidate(schoolCode: string, name: string): string;
    };
    const candidateSpy = vi
      .spyOn(steamxIds, 'generateCandidate')
      .mockReturnValue(fixture.schoolA.teacher.steamxId);

    try {
      const response = await createTeacher(adminCookie, {
        name: 'Exhausted Collision',
        password: TENANCY_TEST_PASSWORD,
        schoolId: fixture.schoolA.school.id,
      }).expect(409);

      expect(response.body).toMatchObject({
        code: 'STEAMX_ID_UNAVAILABLE',
        message: "Couldn't allocate a SteamX ID. Please try again.",
      });
    } finally {
      candidateSpy.mockRestore();
    }
  });

  it('renames school-user SteamX IDs with validation, scope, permission and login checks', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const studentCookie = await loginAs(app, fixture.schoolA.student);
    const targetUser = await createAndTrackTeacher(
      adminCookie,
      'SteamX ID Rename Target',
      fixture.schoolA.school.id,
    );
    const newSteamxId = `${fixture.schoolA.school.code}-RENAMED001`;

    const renamed = await renameSteamxId(
      adminCookie,
      targetUser.id,
      `  ${newSteamxId.toLowerCase()}  `,
    ).expect(200);
    expect(renamed.body.steamxId).toBe(newSteamxId);

    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({
          steamxId: targetUser.steamxId,
          password: TENANCY_TEST_PASSWORD,
        })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ steamxId: newSteamxId, password: TENANCY_TEST_PASSWORD })
        .expect(200);

      await renameSteamxId(adminCookie, fixture.schoolA.student.id, 'OTHER-RENAMED001')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_STEAMX_ID'));
      await renameSteamxId(
        adminCookie,
        fixture.schoolA.student.id,
        `${fixture.schoolA.school.code}-BAD1`,
      )
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_STEAMX_ID'));
      await renameSteamxId(adminCookie, fixture.admin.id, newSteamxId)
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('STEAMX_ID_NOT_RENAMABLE'));

      const takenUser = await createAndTrackTeacher(
        adminCookie,
        'Existing SteamX ID',
        fixture.schoolA.school.id,
      );
      await renameSteamxId(adminCookie, fixture.schoolA.student.id, takenUser.steamxId)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('STEAMX_ID_TAKEN'));

      await renameSteamxId(teacherCookie, fixture.schoolB.teacher.id, newSteamxId).expect(404);
      await renameSteamxId(studentCookie, fixture.schoolA.student.id, newSteamxId).expect(403);
    } finally {
      await renameSteamxId(adminCookie, targetUser.id, targetUser.steamxId).expect(200);
    }
  });

  it('requires an active school and keeps school staff inside their school', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const baseBody = { name: 'Scoped teacher', password: TENANCY_TEST_PASSWORD };

    await createTeacher(adminCookie, baseBody)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('SCHOOL_REQUIRED'));
    await createTeacher(adminCookie, {
      ...baseBody,
      schoolId: randomUUID(),
    }).expect(404);
    await createTeacher(teacherCookie, {
      ...baseBody,
      schoolId: fixture.schoolB.school.id,
    }).expect(404);
    await createTeacher(teacherCookie, baseBody)
      .expect(201)
      .then(({ body }) => {
        createdUserIds.push(body.id as string);
      });

    await prisma.school.update({
      where: { id: fixture.schoolA.school.id },
      data: { status: SchoolStatus.INACTIVE },
    });
    try {
      await createTeacher(adminCookie, {
        ...baseBody,
        schoolId: fixture.schoolA.school.id,
      })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('SCHOOL_INACTIVE'));
    } finally {
      await prisma.school.update({
        where: { id: fixture.schoolA.school.id },
        data: { status: SchoolStatus.ACTIVE },
      });
    }
  });

  it('updates school users, validates type-specific fields, and changes student classes atomically', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const prefix = randomUUID().replaceAll('-', '').slice(0, 8).toLowerCase();
    const teacher = await createAndTrackTeacher(
      adminCookie,
      'Editable Teacher',
      fixture.schoolA.school.id,
      { email: `${prefix}-teacher@example.com` },
    );
    const otherTeacher = await createAndTrackTeacher(
      adminCookie,
      'Other Editable Teacher',
      fixture.schoolA.school.id,
      { email: `${prefix}-other@example.com` },
    );
    const studentResponse = await createStudent(adminCookie, {
      name: 'Editable Student',
      password: TENANCY_TEST_PASSWORD,
      classSectionId: fixture.schoolA.section.id,
      schoolId: fixture.schoolA.school.id,
      guardianName: 'Original Guardian',
    }).expect(201);
    const studentId = studentResponse.body.id as string;
    createdUserIds.push(studentId);

    const updatedTeacher = await updateUser(adminCookie, teacher.id, {
      name: '  Updated Teacher  ',
      email: `  ${prefix}-updated@example.com  `,
      primaryAssignment: '  Science  ',
    }).expect(200);
    expect(updatedTeacher.body).toMatchObject({
      name: 'Updated Teacher',
      email: `${prefix}-updated@example.com`,
      profile: { primaryAssignment: 'Science' },
    });
    expect(JSON.stringify(updatedTeacher.body)).not.toContain('passwordHash');

    await updateUser(adminCookie, teacher.id, {}).expect(400);
    await updateUser(adminCookie, studentId, { email: `${prefix}-invalid@example.com` })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('FIELD_NOT_APPLICABLE'));
    await updateUser(adminCookie, teacher.id, { guardianName: null })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('FIELD_NOT_APPLICABLE'));
    await updateUser(adminCookie, teacher.id, { email: otherTeacher.email })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CONFLICT'));

    const originalProfile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: studentId },
      select: { classSectionId: true, guardianName: true },
    });
    await updateUser(adminCookie, studentId, {
      classSectionId: fixture.schoolB.section.id,
    }).expect(404);
    await expect(
      prisma.studentProfile.findUniqueOrThrow({
        where: { userId: studentId },
        select: { classSectionId: true, guardianName: true },
      }),
    ).resolves.toEqual(originalProfile);

    const newSection = await prisma.classSection.create({
      data: { schoolId: fixture.schoolA.school.id, className: `Move ${prefix}` },
      select: { id: true },
    });
    createdClassSectionIds.push(newSection.id);
    const updatedStudent = await updateUser(adminCookie, studentId, {
      classSectionId: newSection.id,
    }).expect(200);
    expect(updatedStudent.body.profile).toEqual({
      guardianName: 'Original Guardian',
      classSectionId: newSection.id,
    });
    expect(JSON.stringify(updatedStudent.body)).not.toContain('passwordHash');
  });

  it('changes status immediately for existing sessions and allows reactivation', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const user = await createAndTrackTeacher(
      adminCookie,
      'Status Change Target',
      fixture.schoolA.school.id,
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    const userCookie = await loginAs(app, {
      steamxId: user.steamxId,
      password: TENANCY_TEST_PASSWORD,
    });
    const unaffectedCookie = await loginAs(app, fixture.schoolB.teacher);

    const deactivated = await updateUserStatus(adminCookie, user.id, UserStatus.INACTIVE).expect(
      200,
    );
    expect(deactivated.body.status).toBe(UserStatus.INACTIVE);
    await getUser(userCookie, user.id).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ steamxId: user.steamxId, password: TENANCY_TEST_PASSWORD })
      .expect(401);
    await getUser(unaffectedCookie, fixture.schoolB.teacher.id).expect(200);

    await updateUserStatus(adminCookie, user.id, UserStatus.ACTIVE).expect(200);
    await getUser(userCookie, user.id).expect(200);
    await updateUserStatus(adminCookie, user.id, UserStatus.ACTIVE).expect(200);
  });

  it('enforces management scope, rejects platform staff targets, and scopes password resets', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const platformStaff = await prisma.$transaction((tx) =>
      createTestUser(tx, {
        userType: UserType.PLATFORM_STAFF,
        name: 'Unmanageable Platform Staff',
        passwordHash: 'test-only-password-hash',
      }),
    );
    createdUserIds.push(platformStaff.id);

    await updateUser(teacherCookie, fixture.schoolB.teacher.id, { name: 'Out of scope' }).expect(
      404,
    );
    await updateUserStatus(teacherCookie, fixture.schoolB.teacher.id, UserStatus.INACTIVE).expect(
      404,
    );
    await resetUserPassword(
      teacherCookie,
      fixture.schoolB.teacher.id,
      'Chosen reset password 2026!',
    ).expect(404);
    await updateUser(adminCookie, platformStaff.id, { name: 'Blocked update' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('USER_NOT_MANAGEABLE'));
    await updateUserStatus(adminCookie, platformStaff.id, UserStatus.INACTIVE)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('USER_NOT_MANAGEABLE'));
    await updateUserStatus(adminCookie, fixture.admin.id, UserStatus.INACTIVE)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('CANNOT_DEACTIVATE_SELF'));
  });

  it('resets passwords with scope checks, token revocation, and a forced password change', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const target = await createAndTrackTeacher(
      adminCookie,
      'Password Reset Target',
      fixture.schoolA.school.id,
    );
    await prisma.user.update({
      where: { id: target.id },
      data: { mustChangePassword: false },
    });
    const targetCookie = await loginAs(app, {
      steamxId: target.steamxId,
      password: TENANCY_TEST_PASSWORD,
    });
    const chosenPassword = 'Admin chosen reset password 2026!';

    await getUser(targetCookie, target.id).expect(200);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2_000);
    await resetUserPassword(adminCookie, target.id, `prefix-${target.steamxId}-suffix`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('PASSWORD_POLICY'));
    const reset = await resetUserPassword(adminCookie, target.id, chosenPassword).expect(204);
    expect(reset.text).toBe('');
    await getUser(targetCookie, target.id).expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ steamxId: target.steamxId, password: chosenPassword })
      .expect(200);
    expect(login.body.mustChangePassword).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ steamxId: target.steamxId, password: TENANCY_TEST_PASSWORD })
      .expect(401);
    await resetUserPassword(adminCookie, fixture.admin.id, chosenPassword)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('CANNOT_RESET_OWN_PASSWORD'));
  });

  it('validates student sections against the requested school', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    await createStudent(adminCookie, {
      name: 'Wrong school section',
      password: TENANCY_TEST_PASSWORD,
      classSectionId: fixture.schoolB.section.id,
      schoolId: fixture.schoolA.school.id,
    }).expect(404);
  });

  it('filters and paginates users in stable order without returning password hashes', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const prefix = `List${randomUUID().slice(0, 8)}`;
    const first = await createAndTrackTeacher(
      adminCookie,
      `${prefix} First`,
      fixture.schoolA.school.id,
      { email: `${prefix.toLowerCase()}-first@example.com` },
    );
    const second = await createAndTrackTeacher(
      adminCookie,
      `${prefix} Second`,
      fixture.schoolA.school.id,
      { email: `${prefix.toLowerCase()}-second@example.com` },
    );

    const query = {
      page: 1,
      limit: 1,
      schoolId: fixture.schoolA.school.id,
      role: 'teacher',
      status: 'ACTIVE',
      q: prefix,
    };
    const pageOne = await listUsers(adminCookie, query).expect(200);
    const pageTwo = await listUsers(adminCookie, { ...query, page: 2 }).expect(200);
    expect(pageOne.body).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(pageTwo.body).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(JSON.stringify(pageOne.body)).not.toContain('passwordHash');
    expect(JSON.stringify(pageTwo.body)).not.toContain('passwordHash');

    const expectedOrder = [first, second].sort((left, right) => {
      const createdAtDifference =
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return createdAtDifference || left.id.localeCompare(right.id);
    });
    const firstPageItem = pageOne.body.items[0] as { id: string } | undefined;
    const secondPageItem = pageTwo.body.items[0] as { id: string } | undefined;
    expect(firstPageItem?.id).toBe(expectedOrder[0]?.id);
    expect(secondPageItem?.id).toBe(expectedOrder[1]?.id);

    if (first.email === null) {
      throw new Error('Expected created teacher email to be present.');
    }

    await listUsers(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      q: first.email,
    })
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toEqual([first.id]),
      );
  });

  it('restricts school staff list and detail reads to themselves and their school', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const ownUser = await getUser(teacherCookie, fixture.schoolA.teacher.id).expect(200);
    expect(JSON.stringify(ownUser.body)).not.toContain('passwordHash');

    const foreignUserResponse = await getUser(teacherCookie, fixture.schoolB.teacher.id).expect(
      404,
    );
    const randomUserResponse = await getUser(teacherCookie, randomUUID()).expect(404);
    expect({ ...foreignUserResponse.body, requestId: undefined }).toEqual({
      ...randomUserResponse.body,
      requestId: undefined,
    });

    const ownList = await listUsers(teacherCookie).expect(200);
    expect(ownList.body.total).toBe(1);
    expect(ownList.body.items.map((item: { id: string }) => item.id)).toEqual([
      fixture.schoolA.teacher.id,
    ]);
    await listUsers(teacherCookie, { schoolId: fixture.schoolB.school.id }).expect(404);
  });

  it('explains which permission is missing when the caller role is not granted access', async () => {
    const studentCookie = await loginAs(app, fixture.schoolA.student);
    const response = await listUsers(studentCookie).expect(403);

    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining(PERMISSION.USER_READ),
    });
    expect(response.body.message).toContain('Ask an administrator to grant it to your role.');
  });

  it('rolls back a user when its teacher profile insert fails', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const suffix = randomUUID().replaceAll('-', '');
    const triggerName = `ten4_fail_teacher_profile_${suffix}`;
    const functionName = `ten4_fail_teacher_profile_fn_${suffix}`;
    const email = `rollback-${suffix}@example.com`;

    try {
      await setupClient.$executeRawUnsafe(
        `CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.primary_assignment = '__TEN4_PROFILE_FAILURE__' THEN RAISE EXCEPTION 'TEN-4 profile insert failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`,
      );
      await setupClient.$executeRawUnsafe(
        `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON teacher_profiles FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
      );
      await createTeacher(adminCookie, {
        name: 'Profile rollback case',
        email,
        password: TENANCY_TEST_PASSWORD,
        schoolId: fixture.schoolA.school.id,
        primaryAssignment: '__TEN4_PROFILE_FAILURE__',
      }).expect(500);
      await expect(
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
      ).resolves.toBeNull();
    } finally {
      await setupClient.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON teacher_profiles`,
      );
      await setupClient.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });
});
