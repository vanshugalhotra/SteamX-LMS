/**
 * Checks class-section API behavior, permissions, and school isolation.
 */
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
import { isPrismaKnownError } from '../../src/common/errors/prisma-error.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../factories/fixtures.js';
import { cleanupFixtures } from '../setup/cleanup.js';
import { grantPermissions } from '../setup/grant-permissions.js';
import { loginAs } from '../setup/login.js';
import { withRollback } from '../setup/with-rollback.js';
import '../setup/setup-env.js';

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
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
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
      .then(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
    await post(adminCookie, { schoolId: randomUUID(), className: `${prefix} Unknown` }).expect(404);

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

  it('maps case-insensitive unique index violations to Prisma P2002 and a conflict response', async () => {
    const adminCookie = await loginAs(app, fixture.admin);
    const className = `Prisma duplicate ${randomUUID().slice(0, 8)}`;
    const sectionName = 'Purple';

    await withRollback(prisma, async (tx) => {
      await tx.classSection.create({
        data: { schoolId: fixture.schoolA.school.id, className, sectionName },
      });
      let duplicateError: unknown;
      try {
        await tx.classSection.create({
          data: {
            schoolId: fixture.schoolA.school.id,
            className: className.toLowerCase(),
            sectionName: sectionName.toLowerCase(),
          },
        });
      } catch (error) {
        duplicateError = error;
      }
      expect(isPrismaKnownError(duplicateError)).toBe(true);
      if (!isPrismaKnownError(duplicateError)) {
        throw new Error('Expected Prisma known request error for duplicate class section.');
      }
      expect(duplicateError.code).toBe('P2002');
    });

    const section = await createSection(
      adminCookie,
      fixture.schoolA.school.id,
      className,
      sectionName,
    );
    await post(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      className: className.toLowerCase(),
      sectionName: sectionName.toLowerCase(),
    })
      .expect(409)
      .then(({ body }) => expect(body.code).toBe('CLASS_SECTION_EXISTS'));
    expect(section.schoolId).toBe(fixture.schoolA.school.id);
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

    let deleteError: unknown;
    try {
      await prisma.classSection.delete({ where: { id: fixture.schoolA.section.id } });
    } catch (error) {
      deleteError = error;
    }
    expect(isPrismaKnownError(deleteError)).toBe(true);
    if (!isPrismaKnownError(deleteError)) {
      throw new Error(
        'Expected Prisma known request error when deleting a section used by a student.',
      );
    }
    expect(deleteError.code).toBe('P2003');

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
    await remove(adminCookie, randomUUID()).expect(404);
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
    await getList(adminCookie, { limit: 101 }).expect(400);
    await getList(adminCookie, { q: 'x'.repeat(101) }).expect(400);
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
  });

  it('hides foreign sections for a read-only teacher and keeps foreign and missing IDs alike', async () => {
    const teacherCookie = await loginAs(app, fixture.schoolA.teacher);
    const foreignId = fixture.schoolB.section.id;
    await getById(teacherCookie, foreignId).expect(404);
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
});
