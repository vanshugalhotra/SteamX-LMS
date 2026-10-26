/**
 * Covers ordered course modules, status rules, authorization, and FK-protected deletion.
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
import { ContentStatus } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';

describe('Course modules endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let revokeTeacherPermissions: (() => Promise<void>) | undefined;
  let revokeStudentPermissions: (() => Promise<void>) | undefined;
  const createdCourseIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Course modules e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const curriculumPermissions = [PERMISSION.CURRICULUM_READ, PERMISSION.CURRICULUM_WRITE];
    const teacherGrant = await grantPermissions(setupClient, 'teacher', curriculumPermissions);
    const studentGrant = await grantPermissions(setupClient, 'student', curriculumPermissions);
    revokeTeacherPermissions = teacherGrant.revoke;
    revokeStudentPermissions = studentGrant.revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    fixture = await createTwoSchoolFixture(prisma);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Course modules e2e tests require a configured CORS_ORIGINS entry.');
    }
  });

  afterAll(async () => {
    if (createdCourseIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.lesson.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.module.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.course.deleteMany({ where: { id: { in: createdCourseIds } } });
      });
    }
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
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await revokeStudentPermissions?.();
    await revokeTeacherPermissions?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function postCourse(title: string) {
    return request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ title });
  }

  let adminCookie: string;

  async function createCourse(title: string): Promise<string> {
    const response = await postCourse(title).expect(201);
    createdCourseIds.push(response.body.id as string);
    return response.body.id as string;
  }

  function postModule(cookie: string, courseId: string, body: object) {
    return request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/modules`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function listModules(cookie: string, courseId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}/modules`)
      .set('Cookie', cookie);
  }

  function reorderModules(cookie: string, courseId: string, moduleIds: string[]) {
    return request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/modules/order`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ moduleIds });
  }

  function getModule(cookie: string, moduleId: string) {
    return request(app.getHttpServer()).get(`/api/v1/modules/${moduleId}`).set('Cookie', cookie);
  }

  function patchModule(cookie: string, moduleId: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/modules/${moduleId}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchModuleStatus(cookie: string, moduleId: string, status: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/modules/${moduleId}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  function deleteModule(cookie: string, moduleId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/modules/${moduleId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  async function createModule(
    cookie: string,
    courseId: string,
    title: string,
  ): Promise<{ id: string; courseId: string; title: string; position: number }> {
    const response = await postModule(cookie, courseId, { title }).expect(201);
    expect(response.body.status).toBe(ContentStatus.DRAFT);
    return response.body as { id: string; courseId: string; title: string; position: number };
  }

  async function expectOrdered(cookie: string, courseId: string, expectedIds: string[]) {
    const response = await listModules(cookie, courseId).expect(200);
    expect(response.body.map((module: { id: string }) => module.id)).toEqual(expectedIds);
    const positions = response.body.map((module: { position: number }) => module.position);
    expect(
      positions.every(
        (position: number, index: number) => index === 0 || position > positions[index - 1],
      ),
    ).toBe(true);
    return response.body as Array<{ id: string; position: number }>;
  }

  beforeEach(async () => {
    adminCookie = await loginAsCookie(app, fixture.admin);
  });

  it('creates modules at the end and returns the ordered, unpaginated list', async () => {
    const courseId = await createCourse(`Modules ${randomUUID().slice(0, 8)}`);
    const first = await createModule(adminCookie, courseId, 'First');
    const second = await createModule(adminCookie, courseId, 'Second');
    const third = await createModule(adminCookie, courseId, 'Third');

    expect(first.courseId).toBe(courseId);
    expect(
      await expectOrdered(adminCookie, courseId, [first.id, second.id, third.id]),
    ).toHaveLength(3);
    const updated = await patchModule(adminCookie, second.id, {
      title: '  Revised module  ',
    }).expect(200);
    expect(updated.body.title).toBe('Revised module');
    expect(Object.keys(updated.body).sort()).toEqual(
      ['courseId', 'createdAt', 'id', 'position', 'status', 'title', 'updatedAt'].sort(),
    );
    expect(
      await getModule(adminCookie, second.id)
        .expect(200)
        .then((response) => response.body.title),
    ).toBe('Revised module');
  });

  it('reorders by a complete module ID list and rejects invalid orders', async () => {
    const courseId = await createCourse(`Order ${randomUUID().slice(0, 8)}`);
    const ids = await Promise.all(
      ['A', 'B', 'C', 'D'].map(
        async (title) => (await createModule(adminCookie, courseId, title)).id,
      ),
    );

    await reorderModules(adminCookie, courseId, [ids[1]!, ids[0]!, ids[2]!, ids[3]!]).expect(200);
    await expectOrdered(adminCookie, courseId, [ids[1]!, ids[0]!, ids[2]!, ids[3]!]);
    await reorderModules(adminCookie, courseId, [...ids].reverse()).expect(200);
    await expectOrdered(adminCookie, courseId, [...ids].reverse());
    const reverseIds = [...ids].reverse();
    await reorderModules(adminCookie, courseId, [...reverseIds.slice(1), reverseIds[0]!]).expect(
      200,
    );
    await expectOrdered(adminCookie, courseId, [...reverseIds.slice(1), reverseIds[0]!]);

    await reorderModules(adminCookie, courseId, ids.slice(1)).expect(400);
    await reorderModules(adminCookie, courseId, [...ids, randomUUID()]).expect(400);
    await reorderModules(adminCookie, courseId, [ids[0]!, ids[0]!, ...ids.slice(2)]).expect(400);
    await reorderModules(adminCookie, courseId, [randomUUID()]).expect(400);

    const emptyCourseId = await createCourse(`Empty order ${randomUUID().slice(0, 8)}`);
    await reorderModules(adminCookie, emptyCourseId, []).expect(200);
    await expectOrdered(adminCookie, emptyCourseId, []);
  });

  it('serializes parallel creates and assigns distinct positions', async () => {
    const courseId = await createCourse(`Parallel ${randomUUID().slice(0, 8)}`);
    const responses = await Promise.all([
      postModule(adminCookie, courseId, { title: 'Parallel A' }),
      postModule(adminCookie, courseId, { title: 'Parallel B' }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const createdIds = responses.map((response) => response.body.id as string);
    const orderedResponse = await listModules(adminCookie, courseId).expect(200);
    const ordered = orderedResponse.body as Array<{ id: string; position: number }>;
    expect(new Set(ordered.map((module) => module.id)).size).toBe(2);
    expect(new Set(ordered.map((module) => module.id))).toEqual(new Set(createdIds));
    expect(new Set(ordered.map((module) => module.position)).size).toBe(2);
    expect(
      ordered.every(
        (module, index) => index === 0 || module.position > ordered[index - 1]!.position,
      ),
    ).toBe(true);
  });

  it('returns not found for unknown course and module IDs', async () => {
    const unknownId = randomUUID();
    await postModule(adminCookie, unknownId, { title: 'Missing course' }).expect(404);
    await listModules(adminCookie, unknownId).expect(404);
    await reorderModules(adminCookie, unknownId, []).expect(404);
    const missingModule = await getModule(adminCookie, unknownId).expect(404);
    expectSafeError(missingModule.body);
  });

  it('validates titles and rejects unknown fields', async () => {
    const courseId = await createCourse(`Validation ${randomUUID().slice(0, 8)}`);
    for (const title of ['', '   ', 'x'.repeat(201)]) {
      await postModule(adminCookie, courseId, { title }).expect(400);
    }
    await postModule(adminCookie, courseId, { title: 'Valid', extra: true }).expect(400);
    const module = await createModule(adminCookie, courseId, 'Valid');
    await patchModule(adminCookie, module.id, { title: '   ' }).expect(400);
    await patchModule(adminCookie, module.id, { title: 'x'.repeat(201) }).expect(400);
    await patchModule(adminCookie, module.id, { title: 'Updated', extra: true }).expect(400);
    await patchModuleStatus(adminCookie, module.id, 'UNKNOWN').expect(400);
    await reorderModules(adminCookie, courseId, ['not-a-uuid']).expect(400);
  });

  it('requires an active parent for activation and enforces content transitions', async () => {
    const draftCourseId = await createCourse(`Draft parent ${randomUUID().slice(0, 8)}`);
    const draftModule = await createModule(adminCookie, draftCourseId, 'Draft child');
    const draftParentConflict = await patchModuleStatus(
      adminCookie,
      draftModule.id,
      ContentStatus.ACTIVE,
    ).expect(409);
    expect(draftParentConflict.body.code).toBe('PARENT_NOT_ACTIVE');

    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${draftCourseId}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status: ContentStatus.ACTIVE })
      .expect(200);
    await patchModuleStatus(adminCookie, draftModule.id, ContentStatus.ACTIVE).expect(200);
    const invalidTransition = await patchModuleStatus(
      adminCookie,
      draftModule.id,
      ContentStatus.DRAFT,
    ).expect(409);
    expect(invalidTransition.body.code).toBe('INVALID_STATUS_TRANSITION');

    const archivedCourseId = await createCourse(`Archived parent ${randomUUID().slice(0, 8)}`);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${archivedCourseId}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status: ContentStatus.ARCHIVED })
      .expect(200);
    const archivedParentModule = await createModule(adminCookie, archivedCourseId, 'Child');
    const archivedParentConflict = await patchModuleStatus(
      adminCookie,
      archivedParentModule.id,
      ContentStatus.ACTIVE,
    ).expect(409);
    expect(archivedParentConflict.body.code).toBe('PARENT_NOT_ACTIVE');
  });

  it('archives active lessons through the database trigger', async () => {
    const courseId = await createCourse(`Cascade ${randomUUID().slice(0, 8)}`);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${courseId}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status: ContentStatus.ACTIVE })
      .expect(200);
    const module = await createModule(adminCookie, courseId, 'Active module');
    await patchModuleStatus(adminCookie, module.id, ContentStatus.ACTIVE).expect(200);
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        moduleId: module.id,
        title: 'Active lesson',
        position: 1,
        status: ContentStatus.ACTIVE,
      },
    });

    await patchModuleStatus(adminCookie, module.id, ContentStatus.ARCHIVED).expect(200);
    await expect(
      prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } }),
    ).resolves.toMatchObject({
      status: ContentStatus.ARCHIVED,
    });
  });

  it('deletes empty modules and appends after the highest remaining position', async () => {
    const courseId = await createCourse(`Delete gap ${randomUUID().slice(0, 8)}`);
    const first = await createModule(adminCookie, courseId, 'First');
    const deleted = await createModule(adminCookie, courseId, 'Delete');
    const last = await createModule(adminCookie, courseId, 'Last');

    await deleteModule(adminCookie, deleted.id).expect(204);
    const appended = await createModule(adminCookie, courseId, 'Appended');
    const ordered = await expectOrdered(adminCookie, courseId, [first.id, last.id, appended.id]);
    expect(ordered.at(-1)?.position).toBeGreaterThan(last.position);
    await deleteModule(adminCookie, deleted.id).expect(404);
  });

  it('rejects deleting a module that has lessons without changing either record', async () => {
    const courseId = await createCourse(`In use ${randomUUID().slice(0, 8)}`);
    const module = await createModule(adminCookie, courseId, 'Referenced');
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        moduleId: module.id,
        title: 'Dependent lesson',
        position: 1,
      },
    });

    const conflict = await deleteModule(adminCookie, module.id).expect(409);
    expect(conflict.body.code).toBe('RESOURCE_IN_USE');
    expect(conflict.body.message).toBe('Resource has dependent records and cannot be deleted');
    expectSafeError(conflict.body);
    await getModule(adminCookie, module.id).expect(200);
    await expect(
      prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } }),
    ).resolves.toMatchObject({ id: lesson.id, courseId, moduleId: module.id });
  });

  it('enforces authentication and platform staff permissions', async () => {
    await request(app.getHttpServer()).get('/api/v1/courses/not-a-uuid/modules').expect(401);
    const courseId = await createCourse(`Denied ${randomUUID().slice(0, 8)}`);
    const module = await createModule(adminCookie, courseId, 'Denied module');

    for (const user of [fixture.schoolA.teacher, fixture.schoolA.student]) {
      const cookie = await loginAsCookie(app, user);
      await listModules(cookie, courseId).expect(403);
      await postModule(cookie, courseId, { title: 'Denied' }).expect(403);
      await reorderModules(cookie, courseId, [module.id]).expect(403);
      await getModule(cookie, module.id).expect(403);
      await patchModule(cookie, module.id, { title: 'Denied' }).expect(403);
      await patchModuleStatus(cookie, module.id, ContentStatus.ACTIVE).expect(403);
      await deleteModule(cookie, module.id).expect(403);
    }
    await deleteModule('', module.id).expect(401);
  });

  it('returns safe errors for malformed IDs', async () => {
    const malformed = await getModule(adminCookie, 'not-a-uuid').expect(400);
    expectSafeError(malformed.body);
    await postModule(adminCookie, 'not-a-uuid', { title: 'Invalid parent' }).expect(400);
    await deleteModule(adminCookie, 'not-a-uuid').expect(400);
    const unknownDelete = await deleteModule(adminCookie, randomUUID()).expect(404);
    expectSafeError(unknownDelete.body);
  });

  function expectSafeError(body: Record<string, unknown>): void {
    expect(body).toHaveProperty('requestId');
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toMatch(/node_modules|PrismaClient|at \w+\s*\(/);
  }
});
