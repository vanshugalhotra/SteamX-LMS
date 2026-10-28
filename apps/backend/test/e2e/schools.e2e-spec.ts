import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { Env } from '../../src/config/env.schema.js';
import { SchoolStatus } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie as loginAs } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';

const REQUIRED_SCHOOL_FIELDS = {
  name: 'New Academy',
  city: 'Seattle',
  state: 'Washington',
  postalCode: '98101',
  country: 'United States',
};

describe('Schools endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let revokeTeacherRead: (() => Promise<void>) | undefined;
  let revokeTeacherManage: (() => Promise<void>) | undefined;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Schools e2e tests require DATABASE_URL.');
    }

    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const grants = await Promise.all([
      grantPermissions(setupClient, 'teacher', [PERMISSION.SCHOOL_READ]),
      grantPermissions(setupClient, 'teacher', [PERMISSION.SCHOOL_MANAGE]),
    ]);
    revokeTeacherRead = grants[0].revoke;
    revokeTeacherManage = grants[1].revoke;

    app = await createTestApp(AppModule);

    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Schools e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);
  });

  afterAll(async () => {
    if (fixture) {
      const userIds = [
        fixture.admin.id,
        fixture.schoolA.teacher.id,
        fixture.schoolA.student.id,
        fixture.schoolB.teacher.id,
        fixture.schoolB.student.id,
      ];
      await prisma.$transaction(async (tx) => {
        await tx.school.updateMany({
          where: { id: { in: [fixture.schoolA.school.id, fixture.schoolB.school.id] } },
          data: { status: SchoolStatus.ACTIVE },
        });
        await tx.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.classSection.deleteMany({
          where: { id: { in: [fixture.schoolA.section.id, fixture.schoolB.section.id] } },
        });
        await tx.school.deleteMany({
          where: {
            id: {
              in: [fixture.schoolA.school.id, fixture.schoolB.school.id, ...createdSchoolIds],
            },
          },
        });
      });
    }

    await app?.close();
    await revokeTeacherManage?.();
    await revokeTeacherRead?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function createBody(code: string, fields: Record<string, unknown> = {}) {
    return { code, ...REQUIRED_SCHOOL_FIELDS, ...fields };
  }

  function createSchool(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/schools')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchSchool(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/schools/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function changeStatus(cookie: string, id: string, status: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/schools/${id}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  async function createAndTrack(
    cookie: string,
    code: string,
    fields: Record<string, unknown> = {},
  ) {
    const response = await createSchool(cookie, createBody(code, fields)).expect(201);
    createdSchoolIds.push(response.body.id as string);
    return response.body as { id: string; code: string; name: string };
  }

  it('creates schools with normalized code and rejects invalid or duplicate inputs', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const created = await createSchool(
      adminCookie,
      createBody(' ab-12 ', {
        contactEmail: '  CONTACT@EXAMPLE.COM ',
        streetAddress: null,
        contactName: null,
        contactPhone: null,
      }),
    ).expect(201);
    createdSchoolIds.push(created.body.id as string);
    expect(created.body).toMatchObject({
      code: 'AB-12',
      name: REQUIRED_SCHOOL_FIELDS.name,
      contactEmail: 'contact@example.com',
      streetAddress: null,
      contactName: null,
      contactPhone: null,
      status: SchoolStatus.ACTIVE,
    });
    expect(created.body).not.toHaveProperty('schoolId');
    expect(created.body).not.toHaveProperty('passwordHash');

    expectError(await createSchool(adminCookie, createBody('ab-12')), 409, 'SCHOOL_CODE_EXISTS');
    await createSchool(adminCookie, createBody('bad!'))
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await createSchool(adminCookie, createBody('A'))
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await createSchool(adminCookie, { ...createBody('TYPE01'), code: 12 })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await createSchool(adminCookie, createBody('   '))
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await createSchool(adminCookie, createBody('A'.repeat(13)))
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await createSchool(adminCookie, createBody('BLANK1', { name: '   ' }))
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await createSchool(adminCookie, createBody('EMAIL1', { contactEmail: 'not-an-email' }))
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    for (const field of ['streetAddress', 'contactName', 'contactPhone']) {
      await createSchool(
        adminCookie,
        createBody(`S${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`, {
          [field]: '   ',
        }),
      )
        .expect(400)
        .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    }
    await createSchool(adminCookie, { ...createBody('UNKNOWN1'), extra: true })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  // Required and optional school fields enforce types, trimmed non-empty content, and length limits.
  it.each([
    ['missing name', { name: undefined }],
    ['null name', { name: null }],
    ['non-string name', { name: 42 }],
    ['overlong name', { name: 'N'.repeat(121) }],
    ['missing city', { city: undefined }],
    ['whitespace city', { city: '   ' }],
    ['overlong address', { streetAddress: 'A'.repeat(256) }],
    ['whitespace optional contact name', { contactName: '   ' }],
    ['non-string contact phone', { contactPhone: 123 }],
  ])('rejects %s with a validation error', async (_caseName, fields) => {
    const adminCookie = await loginAs(app, fixture.admin);

    const response = await createSchool(
      adminCookie,
      createBody(`VAL${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`, fields),
    ).expect(400);

    expectError(response, 400, 'VALIDATION_ERROR');
  });

  // School code and text field limits include both documented code boundaries.
  it('accepts school code lengths two and twelve and text values at their maximum', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const twoCharacter = await createAndTrack(
      adminCookie,
      `A${randomUUID().slice(0, 1).toUpperCase()}`,
    );
    const twelveCharacter = await createAndTrack(adminCookie, 'ABCDEFGHIJKL', {
      name: 'N'.repeat(120),
      city: 'C'.repeat(100),
      state: 'S'.repeat(100),
      postalCode: 'P'.repeat(20),
      country: 'C'.repeat(100),
      streetAddress: 'A'.repeat(255),
      contactName: 'N'.repeat(120),
      contactPhone: '1'.repeat(32),
    });

    expect(twoCharacter.code).toHaveLength(2);
    expect(twelveCharacter.code).toBe('ABCDEFGHIJKL');
    expect(twelveCharacter.name).toHaveLength(120);
  });

  it('updates schools without permitting code changes and allows nullable optional fields', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const updated = await patchSchool(adminCookie, fixture.schoolA.school.id, {
      name: 'Updated Academy',
      state: 'Haryana',
      streetAddress: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
    }).expect(200);
    expect(updated.body).toMatchObject({
      id: fixture.schoolA.school.id,
      name: 'Updated Academy',
      state: 'Haryana',
      streetAddress: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
    });

    await patchSchool(adminCookie, fixture.schoolA.school.id, { code: 'CHANGED1' }).expect(400);
    await patchSchool(adminCookie, fixture.schoolA.school.id, {}).expect(400);
    await patchSchool(adminCookie, fixture.schoolA.school.id, { name: null }).expect(400);
    await patchSchool(adminCookie, fixture.schoolA.school.id, { name: '   ' })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  // A school-scoped manager can update only its own school; foreign IDs remain indistinguishable from missing.
  it('hides foreign school updates from a school-scoped manager', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const original = await prisma.school.findUniqueOrThrow({
      where: { id: fixture.schoolB.school.id },
      select: { name: true, city: true },
    });

    const foreign = await patchSchool(teacherCookie, fixture.schoolB.school.id, {
      name: 'Should not change',
    }).expect(404);
    const missing = await patchSchool(teacherCookie, randomUUID(), {
      name: 'Should not change',
    }).expect(404);

    expect(foreign.body.code).toBe('NOT_FOUND');
    expect(missing.body.code).toBe('NOT_FOUND');
    expect(foreign.body).not.toHaveProperty('stack');
    await expect(
      prisma.school.findUniqueOrThrow({
        where: { id: fixture.schoolB.school.id },
        select: { name: true, city: true },
      }),
    ).resolves.toEqual(original);
  });

  // Valid school patches trim values and normalize contact emails before persistence.
  it('trims school update fields and lowercases contact email', async () => {
    const adminCookie = await loginAs(app, fixture.admin);

    const response = await patchSchool(adminCookie, fixture.schoolA.school.id, {
      name: '  Trimmed School  ',
      city: '  Test City  ',
      contactEmail: '  OFFICE@EXAMPLE.COM  ',
    }).expect(200);

    expect(response.body).toMatchObject({
      name: 'Trimmed School',
      city: 'Test City',
      contactEmail: 'office@example.com',
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  // Unknown fields, invalid IDs, and overlong/wrongly typed values fail with the standard validation shape.
  it.each([
    ['unknown field', { name: 'Valid', schoolId: 'not-accepted' }],
    ['wrong field type', { name: 4 }],
    ['overlong field', { city: 'C'.repeat(101) }],
  ])('rejects an invalid school update with %s', async (_caseName, body) => {
    const adminCookie = await loginAs(app, fixture.admin);

    const response = await patchSchool(adminCookie, fixture.schoolA.school.id, body).expect(400);

    expectError(response, 400, 'VALIDATION_ERROR');
  });

  // Path IDs are parsed as UUIDs before a school update is delegated.
  it('rejects a malformed school update ID', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const response = await patchSchool(adminCookie, 'not-a-uuid', { name: 'Valid' }).expect(400);

    expectError(response, 400, 'BAD_REQUEST');
  });

  it('paginates, filters, searches, and orders platform school lists', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const prefix = `PAG${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
    const gamma = await createAndTrack(adminCookie, `${prefix}G`, {
      name: 'Pagination Listing Gamma',
    });
    const alpha = await createAndTrack(adminCookie, `${prefix}A`, {
      name: 'Pagination Listing Alpha',
    });
    const beta = await createAndTrack(adminCookie, `${prefix}B`, {
      name: 'Pagination Listing Beta',
    });
    await changeStatus(adminCookie, gamma.id, SchoolStatus.INACTIVE).expect(200);

    const page = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ page: 2, limit: 1, q: 'pAgInAtIoN LiStInG' })
      .expect(200);
    expect(page.body).toMatchObject({
      page: 2,
      limit: 1,
      total: 3,
      items: [{ id: beta.id, name: 'Pagination Listing Beta' }],
    });

    const active = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ status: SchoolStatus.ACTIVE, q: prefix.toLowerCase() })
      .expect(200);
    expect(active.body.total).toBe(2);
    expect(active.body.items.map((school: { id: string }) => school.id)).toEqual([
      alpha.id,
      beta.id,
    ]);

    const tiedFirst = await createAndTrack(adminCookie, `${prefix}D1`, {
      name: 'Tie Order School',
    });
    const tiedSecond = await createAndTrack(adminCookie, `${prefix}D2`, {
      name: 'Tie Order School',
    });
    const tied = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ q: 'Tie Order School' })
      .expect(200);
    expect(tied.body.items.map((school: { id: string }) => school.id)).toEqual(
      [tiedFirst.id, tiedSecond.id].sort(),
    );

    for (const invalidQuery of [
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: 101 },
      { page: 100001 },
    ]) {
      expectError(
        await request(app.getHttpServer())
          .get('/api/v1/schools')
          .set('Cookie', adminCookie)
          .query(invalidQuery),
        400,
        'VALIDATION_ERROR',
      );
    }

    const defaults = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ q: 'No school can match this value' })
      .expect(200);
    expect(defaults.body).toMatchObject({ page: 1, limit: 20, total: 0, items: [] });

    const maxPage = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ q: prefix, limit: 100 })
      .expect(200);
    expect(maxPage.body.limit).toBe(100);

    const beyondLast = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ q: prefix, page: 100, limit: 2 })
      .expect(200);
    expect(beyondLast.body).toMatchObject({ page: 100, limit: 2, total: 5, items: [] });

    const statusOnly = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ status: SchoolStatus.INACTIVE })
      .expect(200);
    expect(
      statusOnly.body.items.every(
        (school: { status: string }) => school.status === SchoolStatus.INACTIVE,
      ),
    ).toBe(true);
    const searchOnly = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ q: prefix.toLowerCase() })
      .expect(200);
    expect(searchOnly.body.total).toBe(5);
  });

  it('scopes school reads and lists, with identical errors for foreign and missing ids', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);

    const ownUpdate = await patchSchool(teacherCookie, fixture.schoolA.school.id, {
      name: 'Teacher Managed School',
    }).expect(200);
    expect(ownUpdate.body.name).toBe('Teacher Managed School');
    await changeStatus(teacherCookie, fixture.schoolA.school.id, SchoolStatus.INACTIVE).expect(200);
    await changeStatus(adminCookie, fixture.schoolA.school.id, SchoolStatus.ACTIVE).expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/schools/${fixture.schoolB.school.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const own = await request(app.getHttpServer())
      .get(`/api/v1/schools/${fixture.schoolA.school.id}`)
      .set('Cookie', teacherCookie)
      .expect(200);
    expect(own.body.id).toBe(fixture.schoolA.school.id);
    expect(own.body).not.toHaveProperty('passwordHash');

    const foreign = await request(app.getHttpServer())
      .get(`/api/v1/schools/${fixture.schoolB.school.id}`)
      .set('Cookie', teacherCookie)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get(`/api/v1/schools/${randomUUID()}`)
      .set('Cookie', teacherCookie)
      .expect(404);
    const { requestId: foreignRequestId, ...foreignBody } = foreign.body;
    const { requestId: missingRequestId, ...missingBody } = missing.body;
    expect(foreignBody).toEqual(missingBody);
    expect(foreignRequestId).not.toBe(missingRequestId);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', teacherCookie)
      .expect(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items.map((school: { id: string }) => school.id)).toEqual([
      fixture.schoolA.school.id,
    ]);
    expect(listed.body.items[0]).not.toHaveProperty('users');
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/schools/${fixture.schoolA.school.id}`)
          .set('Cookie', teacherCookie)
      ).body,
    ).not.toHaveProperty('users');
  });

  it('enforces session, permission, platform-only create, and Origin checks', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const studentCookie = await loginAs(app, fixture.schoolA.student);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);

    await request(app.getHttpServer()).get('/api/v1/schools').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', studentCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/schools/${fixture.schoolA.school.id}`)
      .set('Cookie', studentCookie)
      .expect(403);
    await createSchool(studentCookie, createBody(`ST${randomUUID().slice(0, 6)}`)).expect(403);
    await patchSchool(studentCookie, fixture.schoolA.school.id, { name: 'Denied' }).expect(403);
    await changeStatus(studentCookie, fixture.schoolA.school.id, SchoolStatus.INACTIVE).expect(403);

    await createSchool(teacherCookie, createBody(`TC${randomUUID().slice(0, 6)}`)).expect(403);
    await patchSchool(teacherCookie, fixture.schoolA.school.id, { name: 'Teacher update' }).expect(
      200,
    );
    await changeStatus(teacherCookie, fixture.schoolA.school.id, SchoolStatus.INACTIVE).expect(200);
    await changeStatus(adminCookie, fixture.schoolA.school.id, SchoolStatus.ACTIVE).expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/schools')
      .set('Cookie', adminCookie)
      .send(createBody(`OR${randomUUID().slice(0, 6)}`))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/schools/${fixture.schoolA.school.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Denied without Origin' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/schools/${fixture.schoolA.school.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: SchoolStatus.INACTIVE })
      .expect(403);
  });

  // Every school route requires authentication before evaluating its permission or scope.
  it('rejects unauthenticated requests to each school endpoint', async () => {
    expectError(
      await request(app.getHttpServer()).post('/api/v1/schools').set('Origin', origin).send({}),
      401,
      'UNAUTHORIZED',
    );
    expectError(await request(app.getHttpServer()).get('/api/v1/schools'), 401, 'UNAUTHORIZED');
    expectError(
      await request(app.getHttpServer()).get(`/api/v1/schools/${fixture.schoolA.school.id}`),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await request(app.getHttpServer())
        .patch(`/api/v1/schools/${fixture.schoolA.school.id}`)
        .set('Origin', origin)
        .send({ name: 'No session' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await request(app.getHttpServer())
        .patch(`/api/v1/schools/${fixture.schoolA.school.id}/status`)
        .set('Origin', origin)
        .send({ status: SchoolStatus.ACTIVE }),
      401,
      'UNAUTHORIZED',
    );
  });

  it('rejects malformed school IDs on read and status routes', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    expectError(
      await request(app.getHttpServer())
        .get('/api/v1/schools/not-a-uuid')
        .set('Cookie', adminCookie),
      400,
      'BAD_REQUEST',
    );
    expectError(
      await changeStatus(adminCookie, 'not-a-uuid', SchoolStatus.ACTIVE),
      400,
      'BAD_REQUEST',
    );
  });

  // Read permission grants teachers only their own school; school staff still cannot create schools.
  it('allows a school staff reader only its own school and denies its create attempt', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', teacherCookie)
      .expect(200)
      .then(({ body }) =>
        expect(body.items.map((school: { id: string }) => school.id)).toEqual([
          fixture.schoolA.school.id,
        ]),
      );

    expectError(
      await createSchool(teacherCookie, createBody(`TC${randomUUID().slice(0, 6)}`)),
      403,
      'FORBIDDEN',
    );
  });

  it('deactivates schools idempotently, blocks their sessions and restores access on activation', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherACookie = await loginAs(app, fixture.schoolA.teacher);
    const teacherBCookie = await loginAs(app, fixture.schoolB.teacher);

    await changeStatus(adminCookie, fixture.schoolA.school.id, 'INACTIVE       ').expect(200);
    await changeStatus(adminCookie, fixture.schoolA.school.id, SchoolStatus.INACTIVE).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', teacherACookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({
        steamxId: fixture.schoolA.teacher.steamxId,
        password: fixture.schoolA.teacher.password,
      })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', teacherBCookie)
      .expect(200);
    await changeStatus(adminCookie, fixture.schoolA.school.id, SchoolStatus.ACTIVE).expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({
        steamxId: fixture.schoolA.teacher.steamxId,
        password: fixture.schoolA.teacher.password,
      })
      .expect(200);
  });

  // Status payload validation rejects missing, null, non-string, and unknown values.
  it.each([
    ['missing status', {}],
    ['null status', { status: null }],
    ['non-string status', { status: 1 }],
    ['unknown status', { status: 'PAUSED' }],
  ])('rejects a status update with %s', async (_caseName, body) => {
    const adminCookie = await loginAs(app, fixture.admin);
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/schools/${fixture.schoolA.school.id}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(body)
      .expect(400);

    expectError(response, 400, 'VALIDATION_ERROR');
  });

  // School-scoped status changes hide foreign and missing IDs behind the same 404.
  it('hides foreign school status changes from a school-scoped manager', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);

    const foreign = await changeStatus(teacherCookie, fixture.schoolB.school.id, 'INACTIVE').expect(
      404,
    );
    const missing = await changeStatus(teacherCookie, randomUUID(), 'INACTIVE').expect(404);

    expect(foreign.body.code).toBe('NOT_FOUND');
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  // School ID syntax errors are rejected before status lookup, with a uniform client error.
  it('rejects a malformed school ID on status change', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const response = await changeStatus(adminCookie, 'not-a-uuid', SchoolStatus.ACTIVE).expect(400);

    expectError(response, 400, 'BAD_REQUEST');
  });

  // A school code is immutable at the API boundary and cannot be supplied in a partial update.
  it('rejects a code change with a validation error', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const response = await patchSchool(adminCookie, fixture.schoolA.school.id, {
      code: 'CHANGED',
    }).expect(400);

    expectError(response, 400, 'VALIDATION_ERROR');
  });
});
