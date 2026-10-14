import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { Env } from '../../src/config/env.schema.js';
import { configureApp } from '../../src/configure-app.js';
import { SchoolStatus } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../factories/fixtures.js';
import { grantPermissions } from '../setup/grant-permissions.js';
import { loginAs } from '../setup/login.js';
import '../setup/setup-env.js';

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
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Schools e2e tests require DATABASE_URL.');
    }

    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const grant = await grantPermissions(setupClient, 'teacher', [PERMISSION.SCHOOL_READ]);
    revokeTeacherRead = grant.revoke;

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

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

    await createSchool(adminCookie, createBody('ab-12'))
      .expect(409)
      .then(({ body }) =>
        expect(body).toMatchObject({
          code: 'SCHOOL_CODE_EXISTS',
          message: 'School code already exists',
        }),
      );
    await createSchool(adminCookie, createBody('bad!'))
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
        createBody(`SPACE${field.slice(0, 1).toUpperCase()}`, {
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
  });

  it('paginates, filters, searches, and orders platform school lists', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const prefix = `PAG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
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

    await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/schools')
      .set('Cookie', adminCookie)
      .query({ page: Number.MAX_SAFE_INTEGER })
      .expect(400);
  });

  it('scopes school reads and lists, with identical errors for foreign and missing ids', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);

    await request(app.getHttpServer())
      .get(`/api/v1/schools/${fixture.schoolB.school.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const own = await request(app.getHttpServer())
      .get(`/api/v1/schools/${fixture.schoolA.school.id}`)
      .set('Cookie', teacherCookie)
      .expect(200);
    expect(own.body.id).toBe(fixture.schoolA.school.id);

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
    await patchSchool(teacherCookie, fixture.schoolA.school.id, { name: 'Denied' }).expect(403);
    await changeStatus(teacherCookie, fixture.schoolA.school.id, SchoolStatus.INACTIVE).expect(403);

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
});
