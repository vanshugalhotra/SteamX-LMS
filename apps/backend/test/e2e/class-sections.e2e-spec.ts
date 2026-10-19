/**
 * Checks class-section API behavior, permissions, and school isolation.
 */
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
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie as loginAs } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';

describe('Class sections endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let revokeTeacherRead: (() => Promise<void>) | undefined;
  let revokeTeacherManage: (() => Promise<void>) | undefined;
  const createdSectionIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Class sections e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const grant = await grantPermissions(setupClient, 'teacher', [PERMISSION.CLASSSECTION_READ]);
    revokeTeacherRead = grant.revoke;

    await startApp();
    fixture = await createTwoSchoolFixture(prisma);
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
        ],
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id, ...createdSectionIds],
      );
    }
    await app?.close();
    await revokeTeacherManage?.();
    await revokeTeacherRead?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function startApp(): Promise<void> {
    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Class sections e2e tests require a configured CORS_ORIGINS entry.');
    }
  }

  function post(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/class-sections')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function getList(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/class-sections')
      .set('Cookie', cookie)
      .query(query);
  }

  function getById(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/v1/class-sections/${id}`).set('Cookie', cookie);
  }

  function patch(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/class-sections/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function remove(cookie: string, id: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/class-sections/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function removeWithoutSession(id: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/class-sections/${id}`)
      .set('Origin', origin);
  }

  async function createSection(
    cookie: string,
    schoolId: string,
    className: string,
    sectionName?: string,
  ): Promise<{ id: string; schoolId: string; className: string; sectionName: string }> {
    const body = { schoolId, className, ...(sectionName === undefined ? {} : { sectionName }) };
    const response = await post(cookie, body).expect(201);
    createdSectionIds.push(response.body.id as string);
    return response.body as {
      id: string;
      schoolId: string;
      className: string;
      sectionName: string;
    };
  }

  it('creates default and named sections, validates names, school status and duplicates', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const prefix = `Create ${randomUUID().slice(0, 8)}`;
    const defaultSection = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `${prefix} Default`,
    );
    expect(defaultSection.sectionName).toBe('All');
    const namedSection = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `${prefix} Class`,
      ' Section A ',
    );
    expect(namedSection.sectionName).toBe('Section A');
    expect(defaultSection).not.toHaveProperty('school');
    expect(defaultSection).not.toHaveProperty('students');

    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `${prefix} Class`.toLowerCase(),
      sectionName: 'section a',
    })
      .expect(409)
      .then(({ body }) => expect(body.code).toBe('CLASS_SECTION_EXISTS'));
    const otherSchool = await createSection(
      adminCookie,
      fixture.schoolB.school.id,
      `${prefix} Class`,
      'Section A',
    );
    expect(otherSchool.schoolId).toBe(fixture.schoolB.school.id);

    await post(adminCookie, { schoolId: fixture.schoolA.school.id, className: '   ' })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    const boundarySection = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      'C'.repeat(50),
      'S'.repeat(50),
    );
    expect(boundarySection.className).toHaveLength(50);
    expect(boundarySection.sectionName).toHaveLength(50);
    await post(adminCookie, { schoolId: fixture.schoolA.school.id })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, { schoolId: fixture.schoolA.school.id, className: 42 })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `${prefix} Wrong Section Type`,
      sectionName: 42,
    })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `${prefix} Blank`,
      sectionName: '   ',
    })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `${prefix} Null`,
      sectionName: null,
    })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: 'x'.repeat(51),
    }).expect(400);
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `${prefix} Long section`,
      sectionName: 'x'.repeat(51),
    }).expect(400);
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `${prefix} Unknown field`,
      unexpected: true,
    })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, { className: `${prefix} No School` })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('SCHOOL_REQUIRED'));
    await post(adminCookie, { schoolId: randomUUID(), className: `${prefix} Unknown` }).expect(404);
    await post(adminCookie, { schoolId: 'not-a-uuid', className: `${prefix} Malformed` })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));

    await prisma.school.update({
      where: { id: fixture.schoolB.school.id },
      data: { status: SchoolStatus.INACTIVE },
    });
    try {
      await post(adminCookie, {
        schoolId: fixture.schoolB.school.id,
        className: `${prefix} Inactive`,
      })
        .expect(409)
        .then(({ body }) => expect(body.code).toBe('SCHOOL_INACTIVE'));
    } finally {
      await prisma.school.update({
        where: { id: fixture.schoolB.school.id },
        data: { status: SchoolStatus.ACTIVE },
      });
    }
  });

  it('updates names, rejects empty or duplicate updates, and permits case-only renames', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const prefix = `Update ${randomUUID().slice(0, 8)}`;
    const section = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `${prefix} Class`,
      'A',
    );
    const duplicateTarget = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `${prefix} Class`,
      'B',
    );

    await patch(adminCookie, section.id, { sectionName: 'B' })
      .expect(409)
      .then(({ body }) => expect(body.code).toBe('CLASS_SECTION_EXISTS'));
    const changedCase = await patch(adminCookie, section.id, {
      className: `${prefix} Class`.toLowerCase(),
      sectionName: 'a',
    }).expect(200);
    expect(changedCase.body.sectionName).toBe('a');
    await patch(adminCookie, section.id, {}).expect(400);
    await patch(adminCookie, section.id, { className: null }).expect(400);
    await patch(adminCookie, section.id, { schoolId: fixture.schoolB.school.id })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await patch(adminCookie, section.id, { unexpected: 'value' })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    const unchanged = await patch(adminCookie, section.id, {
      className: `${prefix} Class`.toLowerCase(),
      sectionName: 'a',
    }).expect(200);
    expect(unchanged.body.id).toBe(section.id);
    expectError(await patch(adminCookie, 'not-a-uuid', { className: 'Valid' }), 400, 'BAD_REQUEST');
    expectError(await patch(adminCookie, randomUUID(), { className: 'Valid' }), 404, 'NOT_FOUND');
    expect(duplicateTarget.id).not.toBe(section.id);
  });

  it('deletes empty sections and maps student references to CLASS_SECTION_IN_USE', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const removable = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `Delete ${randomUUID().slice(0, 8)}`,
    );
    await remove(adminCookie, removable.id).expect(204);

    await remove(adminCookie, fixture.schoolA.section.id)
      .expect(409)
      .then(({ body }) => {
        expect(body.code).toBe('CLASS_SECTION_IN_USE');
        expect(body.message).toBe('Class section is in use');
      });

    const allSection = await createSection(
      adminCookie,
      fixture.schoolB.school.id,
      `Delete All ${randomUUID().slice(0, 8)}`,
    );
    expect(allSection.sectionName).toBe('All');
    await remove(adminCookie, allSection.id).expect(204);
    expectError(await remove(adminCookie, randomUUID()), 404, 'NOT_FOUND');
    expectError(await remove(adminCookie, 'not-a-uuid'), 400, 'BAD_REQUEST');
  });

  it('lists with pagination, search, stable order and school scope', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const prefix = `List ${randomUUID().slice(0, 8)}`;
    const first = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `${prefix} Class`,
      'A',
    );
    const second = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `${prefix} Class`,
      'B',
    );
    await createSection(adminCookie, fixture.schoolB.school.id, `${prefix} Class`, 'A');

    const list = await getList(adminCookie, {
      q: prefix.toLowerCase(),
      page: 1,
      limit: 1,
    }).expect(200);
    expect(list.body.page).toBe(1);
    expect(list.body.limit).toBe(1);
    expect(list.body.total).toBe(3);
    const pageTwo = await getList(adminCookie, {
      q: prefix,
      page: 2,
      limit: 1,
      schoolId: fixture.schoolA.school.id,
    }).expect(200);
    expect(pageTwo.body.total).toBe(2);
    expect(pageTwo.body.items).toHaveLength(1);
    const schoolOnly = await getList(adminCookie, { schoolId: fixture.schoolB.school.id }).expect(
      200,
    );
    expect(
      schoolOnly.body.items.every(
        (item: { schoolId: string }) => item.schoolId === fixture.schoolB.school.id,
      ),
    ).toBe(true);
    const searchOnly = await getList(adminCookie, { q: prefix.toLowerCase() }).expect(200);
    expect(searchOnly.body.total).toBe(3);

    const ordered = await getList(adminCookie, {
      q: prefix,
      schoolId: fixture.schoolA.school.id,
      limit: 100,
    }).expect(200);
    expect(ordered.body.items.slice(0, 2).map((item: { id: string }) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    const teacherList = await getList(teacherCookie).expect(200);
    expect(
      teacherList.body.items.every(
        (item: { schoolId: string }) => item.schoolId === fixture.schoolA.school.id,
      ),
    ).toBe(true);
    await getList(teacherCookie, { schoolId: fixture.schoolB.school.id }).expect(404);
    await getById(teacherCookie, fixture.schoolA.section.id).expect(200);
    const invalidQueries: Record<string, string | number>[] = [
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: 101 },
      { page: 100001 },
    ];
    for (const invalidQuery of invalidQueries) {
      expectError(await getList(adminCookie, invalidQuery), 400, 'VALIDATION_ERROR');
    }
    await getList(adminCookie, { q: 'x'.repeat(101) }).expect(400);

    const defaultPage = await getList(adminCookie, { q: prefix }).expect(200);
    expect(defaultPage.body).toMatchObject({ page: 1, limit: 20, total: 3 });
    const maxLimit = await getList(adminCookie, {
      q: prefix,
      schoolId: fixture.schoolA.school.id,
      limit: 100,
    }).expect(200);
    expect(maxLimit.body.limit).toBe(100);
    const beyondEnd = await getList(adminCookie, {
      q: prefix,
      schoolId: fixture.schoolA.school.id,
      page: 10,
      limit: 1,
    }).expect(200);
    expect(beyondEnd.body).toMatchObject({ page: 10, limit: 1, total: 2, items: [] });
    const noMatch = await getList(adminCookie, { q: `No match ${randomUUID()}` }).expect(200);
    expect(noMatch.body).toMatchObject({ total: 0, items: [] });
    await getList(adminCookie, { schoolId: 'not-a-uuid' })
      .expect(400)
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await getList(adminCookie, { page: 0 }).expect(400);
    expect(list.body.items[0]).not.toHaveProperty('students');
  });

  it('checks permission before scope and requires auth and Origin on protected routes', async () => {
    const studentCookie = await loginAs(app, fixture.schoolA.student);
    const adminCookie = await loginAs(app, fixture.admin);
    const foreignId = fixture.schoolB.section.id;

    await getList(studentCookie).expect(403);
    await getById(studentCookie, foreignId).expect(403);
    await post(studentCookie, { schoolId: fixture.schoolA.school.id, className: 'Denied' }).expect(
      403,
    );
    await patch(studentCookie, foreignId, { className: 'Denied' }).expect(403);
    await remove(studentCookie, foreignId).expect(403);
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    await patch(teacherCookie, fixture.schoolA.section.id, { className: 'Not allowed' }).expect(
      403,
    );
    await remove(teacherCookie, fixture.schoolA.section.id).expect(403);

    await request(app.getHttpServer()).get('/api/v1/class-sections').expect(401);
    await request(app.getHttpServer()).get(`/api/v1/class-sections/${foreignId}`).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/class-sections')
      .set('Origin', origin)
      .send({ schoolId: fixture.schoolA.school.id, className: 'No session' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/class-sections/${foreignId}`)
      .set('Origin', origin)
      .send({ className: 'No session' })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/v1/class-sections/${foreignId}`)
      .set('Origin', origin)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/class-sections')
      .set('Cookie', adminCookie)
      .send({ schoolId: fixture.schoolA.school.id, className: 'No Origin' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/class-sections/${foreignId}`)
      .set('Cookie', adminCookie)
      .send({ className: 'No Origin' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/class-sections/${foreignId}`)
      .set('Cookie', adminCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/class-sections')
      .set('Cookie', adminCookie)
      .query({ schoolId: fixture.schoolA.school.id })
      .expect(200);
  });

  // Every class-section endpoint requires an authenticated session.
  it('rejects unauthenticated requests to every class-section endpoint', async () => {
    expectError(
      await request(app.getHttpServer()).post('/api/v1/class-sections').set('Origin', origin).send({
        schoolId: fixture.schoolA.school.id,
        className: 'No session',
      }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await request(app.getHttpServer()).get('/api/v1/class-sections'),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await request(app.getHttpServer()).get(
        `/api/v1/class-sections/${fixture.schoolA.section.id}`,
      ),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await request(app.getHttpServer())
        .patch(`/api/v1/class-sections/${fixture.schoolA.section.id}`)
        .set('Origin', origin)
        .send({ className: 'No session' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await removeWithoutSession(fixture.schoolA.section.id), 401, 'UNAUTHORIZED');
  });

  it('hides foreign sections for a read-only teacher and keeps foreign and missing IDs alike', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const adminCookie = await loginAs(app, fixture.admin);
    const foreignId = fixture.schoolB.section.id;
    await getById(teacherCookie, foreignId).expect(404);
    expectError(await getById(adminCookie, 'not-a-uuid'), 400, 'BAD_REQUEST');
    const foreignList = await getList(teacherCookie, {
      schoolId: fixture.schoolB.school.id,
    }).expect(404);
    expect(foreignList.body.code).toBe('NOT_FOUND');

    const foreignGet = await getById(teacherCookie, foreignId).expect(404);
    const missingGet = await getById(teacherCookie, randomUUID()).expect(404);
    const { requestId: _foreignId, ...foreignBody } = foreignGet.body;
    const { requestId: _missingId, ...missingBody } = missingGet.body;
    expect(foreignBody).toEqual(missingBody);

    await patch(teacherCookie, foreignId, { className: 'Denied' }).expect(403);
    await remove(teacherCookie, foreignId).expect(403);
  });

  it('allows platform staff to manage either school and returns not found for missing IDs', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const sectionA = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      `Admin A ${randomUUID().slice(0, 8)}`,
    );
    const sectionB = await createSection(
      adminCookie,
      fixture.schoolB.school.id,
      `Admin B ${randomUUID().slice(0, 8)}`,
    );
    await getById(adminCookie, sectionA.id).expect(200);
    await getById(adminCookie, sectionB.id).expect(200);
    await patch(adminCookie, sectionA.id, { className: 'Admin renamed A' }).expect(200);
    await patch(adminCookie, sectionB.id, { className: 'Admin renamed B' }).expect(200);
    await remove(adminCookie, sectionA.id).expect(204);
    await remove(adminCookie, sectionB.id).expect(204);
    await patch(adminCookie, randomUUID(), { className: 'Missing' }).expect(404);
    await remove(adminCookie, randomUUID()).expect(404);
  });

  it('scopes manage-capable teachers and still returns the same 404 for foreign and missing rows', async () => {
    await app.close();
    const grant = await grantPermissions(setupClient, 'teacher', [PERMISSION.CLASSSECTION_MANAGE]);
    revokeTeacherManage = grant.revoke;
    await startApp();

    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const ownSection = await createSection(
      await loginAs(app, fixture.admin),
      fixture.schoolA.school.id,
      `Teacher Manage ${randomUUID().slice(0, 8)}`,
    );
    const ownUpdate = await patch(teacherCookie, ownSection.id, {
      className: 'Teacher managed section',
    }).expect(200);
    expect(ownUpdate.body.className).toBe('Teacher managed section');
    const teacherCreated = await post(teacherCookie, {
      schoolId: fixture.schoolA.school.id,
      className: `Teacher created ${randomUUID().slice(0, 8)}`,
    }).expect(201);
    createdSectionIds.push(teacherCreated.body.id as string);
    await remove(teacherCookie, teacherCreated.body.id as string).expect(204);
    await post(teacherCookie, {
      schoolId: fixture.schoolB.school.id,
      className: `Foreign create ${randomUUID().slice(0, 8)}`,
    })
      .expect(404)
      .then(({ body }) => expect(body.code).toBe('NOT_FOUND'));
    const foreignSectionId = fixture.schoolB.section.id;
    const foreignPatch = await patch(teacherCookie, foreignSectionId, {
      className: 'Unauthorized change',
    }).expect(404);
    const missingPatch = await patch(teacherCookie, randomUUID(), {
      className: 'Unauthorized change',
    }).expect(404);
    const { requestId: _patchRequestId, ...foreignPatchBody } = foreignPatch.body;
    const { requestId: _missingPatchRequestId, ...missingPatchBody } = missingPatch.body;
    expect(foreignPatchBody).toEqual(missingPatchBody);

    const original = await prisma.classSection.findUniqueOrThrow({
      where: { id: foreignSectionId },
      select: { className: true },
    });
    const foreignDelete = await remove(teacherCookie, foreignSectionId).expect(404);
    const missingDelete = await remove(teacherCookie, randomUUID()).expect(404);
    const { requestId: _deleteRequestId, ...foreignDeleteBody } = foreignDelete.body;
    const { requestId: _missingDeleteRequestId, ...missingDeleteBody } = missingDelete.body;
    expect(foreignDeleteBody).toEqual(missingDeleteBody);
    await expect(
      prisma.classSection.findUniqueOrThrow({
        where: { id: foreignSectionId },
        select: { className: true },
      }),
    ).resolves.toEqual(original);
    const afterDeleteAttempt = await prisma.classSection.findUniqueOrThrow({
      where: { id: foreignSectionId },
      select: { id: true },
    });
    expect(afterDeleteAttempt.id).toBe(foreignSectionId);
  });

  // A school-scoped manager receives 404 rather than access to foreign section IDs or filters.
  it('returns 404 for a foreign section ID and for a foreign school filter', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);

    expectError(await getById(teacherCookie, fixture.schoolB.section.id), 404, 'NOT_FOUND');
    expectError(
      await getList(teacherCookie, { schoolId: fixture.schoolB.school.id }),
      404,
      'NOT_FOUND',
    );
  });
});
