/** Covers lesson CRUD, ordering, status rules, permissions, and FK-protected deletion. */
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
import { ContentStatus, LessonAudience } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';

describe('Lessons endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let revokeTeacherPermissions: (() => Promise<void>) | undefined;
  let revokeStudentPermissions: (() => Promise<void>) | undefined;
  const createdCourseIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Lessons e2e tests require DATABASE_URL.');
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
      throw new Error('Lessons e2e tests require a configured CORS_ORIGINS entry.');
    }
  });

  afterAll(async () => {
    if (createdCourseIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        const lessons = await tx.lesson.findMany({
          where: { courseId: { in: createdCourseIds } },
          select: { id: true },
        });
        await tx.lessonBlock.deleteMany({
          where: { lessonId: { in: lessons.map(({ id }) => id) } },
        });
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

  beforeEach(async () => {
    adminCookie = await loginAsCookie(app, fixture.admin);
  });

  function postCourse(title: string) {
    return request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ title });
  }

  async function createCourse(title: string): Promise<string> {
    const response = await postCourse(title).expect(201);
    createdCourseIds.push(response.body.id as string);
    return response.body.id as string;
  }

  function postModule(cookie: string, courseId: string, title: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/modules`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ title });
  }

  async function createModule(courseId: string, title: string): Promise<string> {
    const response = await postModule(adminCookie, courseId, title).expect(201);
    return response.body.id as string;
  }

  function patchCourseStatus(courseId: string, status: ContentStatus) {
    return request(app.getHttpServer())
      .patch(`/api/v1/courses/${courseId}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status });
  }

  function patchModuleStatus(moduleId: string, status: ContentStatus) {
    return request(app.getHttpServer())
      .patch(`/api/v1/modules/${moduleId}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status });
  }

  function postLesson(cookie: string, moduleId: string, body: object) {
    return request(app.getHttpServer())
      .post(`/api/v1/modules/${moduleId}/lessons`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function listLessons(cookie: string, moduleId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/modules/${moduleId}/lessons`)
      .set('Cookie', cookie);
  }

  function reorderLessons(cookie: string, moduleId: string, lessonIds: string[]) {
    return request(app.getHttpServer())
      .put(`/api/v1/modules/${moduleId}/lessons/order`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ lessonIds });
  }

  function getLesson(cookie: string, lessonId: string) {
    return request(app.getHttpServer()).get(`/api/v1/lessons/${lessonId}`).set('Cookie', cookie);
  }

  function patchLesson(cookie: string, lessonId: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/lessons/${lessonId}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchLessonStatus(cookie: string, lessonId: string, status: ContentStatus) {
    return request(app.getHttpServer())
      .patch(`/api/v1/lessons/${lessonId}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  function deleteLesson(cookie: string, lessonId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/lessons/${lessonId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  async function createLesson(
    moduleId: string,
    title: string,
    audience?: LessonAudience,
  ): Promise<{ id: string; moduleId: string; courseId: string; title: string; position: number }> {
    const response = await postLesson(adminCookie, moduleId, {
      title,
      ...(audience === undefined ? {} : { audience }),
    }).expect(201);
    return response.body as {
      id: string;
      moduleId: string;
      courseId: string;
      title: string;
      position: number;
    };
  }

  async function expectOrder(cookie: string, moduleId: string, expectedIds: string[]) {
    const response = await listLessons(cookie, moduleId).expect(200);
    expect(response.body.map((lesson: { id: string }) => lesson.id)).toEqual(expectedIds);
    const positions = response.body.map((lesson: { position: number }) => lesson.position);
    expect(
      positions.every(
        (position: number, index: number) => index === 0 || position > positions[index - 1],
      ),
    ).toBe(true);
    return response.body as Array<{ id: string; position: number }>;
  }

  it('creates lessons in order with default audience and supports CRUD and audience changes', async () => {
    const courseId = await createCourse(`Lessons ${randomUUID().slice(0, 8)}`);
    const moduleId = await createModule(courseId, 'Module');
    const first = await createLesson(moduleId, 'First');
    const second = await createLesson(moduleId, 'Second', LessonAudience.STUDENT);

    expect(first.courseId).toBe(courseId);
    expect((await getLesson(adminCookie, first.id).expect(200)).body.audience).toBe(
      LessonAudience.TEACHER_ONLY,
    );
    expect(second.position).toBeGreaterThan(first.position);
    await expectOrder(adminCookie, moduleId, [first.id, second.id]);

    const updated = await patchLesson(adminCookie, first.id, {
      title: '  Revised lesson  ',
      audience: LessonAudience.STUDENT,
    }).expect(200);
    expect(updated.body.title).toBe('Revised lesson');
    expect(updated.body.audience).toBe(LessonAudience.STUDENT);
    expect(Object.keys(updated.body).sort()).toEqual(
      [
        'audience',
        'courseId',
        'createdAt',
        'id',
        'moduleId',
        'position',
        'status',
        'title',
        'updatedAt',
      ].sort(),
    );
  });

  it('reorders the complete lesson list and rejects invalid sets', async () => {
    const courseId = await createCourse(`Order ${randomUUID().slice(0, 8)}`);
    const moduleId = await createModule(courseId, 'Module');
    const ids = await Promise.all(
      ['A', 'B', 'C'].map(async (title) => (await createLesson(moduleId, title)).id),
    );

    await reorderLessons(adminCookie, moduleId, [ids[1]!, ids[0]!, ids[2]!]).expect(200);
    await expectOrder(adminCookie, moduleId, [ids[1]!, ids[0]!, ids[2]!]);
    await reorderLessons(adminCookie, moduleId, [...ids].reverse()).expect(200);
    await expectOrder(adminCookie, moduleId, [...ids].reverse());

    expect((await reorderLessons(adminCookie, moduleId, ids.slice(1)).expect(400)).body.code).toBe(
      'INVALID_ORDER',
    );
    expect(
      (await reorderLessons(adminCookie, moduleId, [...ids, randomUUID()]).expect(400)).body.code,
    ).toBe('INVALID_ORDER');
    expect(
      (await reorderLessons(adminCookie, moduleId, [ids[0]!, ids[0]!, ids[2]!]).expect(400)).body
        .code,
    ).toBe('INVALID_ORDER');
    const emptyModuleId = await createModule(courseId, 'Empty module');
    await reorderLessons(adminCookie, emptyModuleId, []).expect(200);
    await expectOrder(adminCookie, emptyModuleId, []);
  });

  it('serializes parallel lesson creation with distinct positions', async () => {
    const courseId = await createCourse(`Parallel ${randomUUID().slice(0, 8)}`);
    const moduleId = await createModule(courseId, 'Module');
    const responses = await Promise.all([
      postLesson(adminCookie, moduleId, { title: 'Parallel A' }),
      postLesson(adminCookie, moduleId, { title: 'Parallel B' }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    const ids = responses.map(({ body }) => body.id as string);
    const ordered = await listLessons(adminCookie, moduleId).expect(200);
    expect(new Set(ordered.body.map((lesson: { id: string }) => lesson.id))).toEqual(new Set(ids));
    expect(new Set(ordered.body.map((lesson: { position: number }) => lesson.position)).size).toBe(
      2,
    );
    const positions = ordered.body.map((lesson: { position: number }) => lesson.position);
    expect(
      positions.every(
        (position: number, index: number) => index === 0 || position > positions[index - 1],
      ),
    ).toBe(true);
  });

  it('requires active parent modules for lesson activation', async () => {
    const courseId = await createCourse(`Active parent ${randomUUID().slice(0, 8)}`);
    const activeModuleId = await createModule(courseId, 'Active source');
    const draftModuleId = await createModule(courseId, 'Draft target');
    const lesson = await createLesson(activeModuleId, 'Lesson');

    const inactiveParent = await patchLessonStatus(
      adminCookie,
      lesson.id,
      ContentStatus.ACTIVE,
    ).expect(409);
    expect(inactiveParent.body.code).toBe('PARENT_NOT_ACTIVE');

    await patchCourseStatus(courseId, ContentStatus.ACTIVE).expect(200);
    await patchModuleStatus(activeModuleId, ContentStatus.ACTIVE).expect(200);
    await patchModuleStatus(draftModuleId, ContentStatus.ACTIVE).expect(200);
    await patchLessonStatus(adminCookie, lesson.id, ContentStatus.ACTIVE).expect(200);
    await patchModuleStatus(draftModuleId, ContentStatus.ARCHIVED).expect(200);

    const invalidTransition = await patchLessonStatus(
      adminCookie,
      lesson.id,
      ContentStatus.DRAFT,
    ).expect(409);
    expect(invalidTransition.body.code).toBe('INVALID_STATUS_TRANSITION');

    await patchModuleStatus(activeModuleId, ContentStatus.ARCHIVED).expect(200);
    await expect(
      prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } }),
    ).resolves.toMatchObject({
      status: ContentStatus.ARCHIVED,
    });
  });

  it('deletes empty lessons with a gap and blocks deletion when a content block exists', async () => {
    const courseId = await createCourse(`Delete ${randomUUID().slice(0, 8)}`);
    const moduleId = await createModule(courseId, 'Module');
    const first = await createLesson(moduleId, 'First');
    const removed = await createLesson(moduleId, 'Removed');
    const last = await createLesson(moduleId, 'Last');

    await deleteLesson(adminCookie, removed.id).expect(204);
    await expectOrder(adminCookie, moduleId, [first.id, last.id]);
    const appended = await createLesson(moduleId, 'Appended');
    const ordered = await expectOrder(adminCookie, moduleId, [first.id, last.id, appended.id]);
    expect(ordered.at(-1)?.position).toBeGreaterThan(last.position);
    await deleteLesson(adminCookie, removed.id).expect(404);

    const blocked = await createLesson(moduleId, 'Has block');
    await prisma.lessonBlock.create({
      data: {
        lessonId: blocked.id,
        type: 'RICH_TEXT',
        content: { text: 'lesson block' },
        position: 1,
      },
    });
    const conflict = await deleteLesson(adminCookie, blocked.id).expect(409);
    expect(conflict.body.code).toBe('RESOURCE_IN_USE');
    expect(conflict.body.message).toBe(
      'A lesson with content blocks must have its blocks removed first.',
    );
    await getLesson(adminCookie, blocked.id).expect(200);
  });

  it('validates request bodies and reports unknown parents and lessons', async () => {
    const courseId = await createCourse(`Validation ${randomUUID().slice(0, 8)}`);
    const moduleId = await createModule(courseId, 'Module');
    for (const title of ['', '   ', 'x'.repeat(201)]) {
      await postLesson(adminCookie, moduleId, { title }).expect(400);
    }
    await postLesson(adminCookie, moduleId, { title: 'Valid', extra: true }).expect(400);
    await postLesson(adminCookie, moduleId, { title: 'Valid', audience: 'INVALID' }).expect(400);
    await postLesson(adminCookie, randomUUID(), { title: 'Missing module' }).expect(404);
    await listLessons(adminCookie, randomUUID()).expect(404);
    await reorderLessons(adminCookie, randomUUID(), []).expect(404);
    await patchLesson(adminCookie, randomUUID(), { title: 'Missing lesson' }).expect(404);
    await patchLessonStatus(adminCookie, randomUUID(), ContentStatus.ACTIVE).expect(404);

    const lesson = await createLesson(moduleId, 'Valid');
    await patchLesson(adminCookie, lesson.id, {}).expect(400);
    await patchLesson(adminCookie, lesson.id, { title: null }).expect(400);
    await patchLesson(adminCookie, lesson.id, { audience: null }).expect(400);
    await patchLesson(adminCookie, lesson.id, { title: 'Updated', unknown: true }).expect(400);
    await postLesson(adminCookie, 'not-a-uuid', { title: 'Malformed module' }).expect(400);
    await listLessons(adminCookie, 'not-a-uuid').expect(400);
    await reorderLessons(adminCookie, 'not-a-uuid', []).expect(400);
    await getLesson(adminCookie, 'not-a-uuid').expect(400);
    await patchLesson(adminCookie, 'not-a-uuid', { title: 'Malformed lesson' }).expect(400);
    await patchLessonStatus(adminCookie, 'not-a-uuid', ContentStatus.ACTIVE).expect(400);
    await deleteLesson(adminCookie, 'not-a-uuid').expect(400);
    await getLesson(adminCookie, randomUUID()).expect(404);
    await deleteLesson(adminCookie, randomUUID()).expect(404);
  });

  it('enforces authentication and platform staff permissions', async () => {
    await request(app.getHttpServer()).get('/api/v1/lessons/not-a-uuid').expect(401);
    const courseId = await createCourse(`Denied ${randomUUID().slice(0, 8)}`);
    const moduleId = await createModule(courseId, 'Module');
    const lesson = await createLesson(moduleId, 'Lesson');

    for (const user of [fixture.schoolA.teacher, fixture.schoolA.student]) {
      const cookie = await loginAsCookie(app, user);
      await listLessons(cookie, moduleId).expect(403);
      await postLesson(cookie, moduleId, { title: 'Denied' }).expect(403);
      await reorderLessons(cookie, moduleId, [lesson.id]).expect(403);
      await getLesson(cookie, lesson.id).expect(403);
      await patchLesson(cookie, lesson.id, { title: 'Denied' }).expect(403);
      await patchLessonStatus(cookie, lesson.id, ContentStatus.ACTIVE).expect(403);
      await deleteLesson(cookie, lesson.id).expect(403);
    }
    await postLesson('', moduleId, { title: 'Unauthenticated' }).expect(401);
    await deleteLesson('', lesson.id).expect(401);
  });
});
