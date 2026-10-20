/**
 * Covers global course CRUD, authorization, status transitions, and database cascades.
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

describe('Courses endpoints (e2e)', () => {
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
      throw new Error('Courses e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const curriculumPermissions = [PERMISSION.CURRICULUM_READ, PERMISSION.CURRICULUM_WRITE];
    const teacherGrant = await grantPermissions(setupClient, 'teacher', curriculumPermissions);
    const studentGrant = await grantPermissions(setupClient, 'student', curriculumPermissions);
    revokeTeacherPermissions = teacherGrant.revoke;
    revokeStudentPermissions = studentGrant.revoke;

    await startApp();
    fixture = await createTwoSchoolFixture(prisma);
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

  async function startApp(): Promise<void> {
    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Courses e2e tests require a configured CORS_ORIGINS entry.');
    }
  }

  function postCourse(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function getCourses(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer()).get('/api/v1/courses').set('Cookie', cookie).query(query);
  }

  function getCourse(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/v1/courses/${id}`).set('Cookie', cookie);
  }

  function patchCourse(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/courses/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchCourseStatus(cookie: string, id: string, status: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/courses/${id}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  function deleteCourse(cookie: string, id: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/courses/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  async function createCourse(
    cookie: string,
    title: string,
    description?: string | null,
  ): Promise<{ id: string; title: string; description: string | null; status: ContentStatus }> {
    const response = await postCourse(cookie, {
      title,
      ...(description === undefined ? {} : { description }),
    }).expect(201);
    const course = response.body as {
      id: string;
      title: string;
      description: string | null;
      status: ContentStatus;
    };
    createdCourseIds.push(course.id);
    return course;
  }

  async function createCourseRecord(title: string, createdAt: Date): Promise<{ id: string }> {
    const course = await prisma.course.create({ data: { title, createdAt } });
    createdCourseIds.push(course.id);
    return course;
  }

  it('creates, reads, and updates a course', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const suffix = randomUUID().slice(0, 8);
    const created = await createCourse(cookie, `  Course ${suffix}  `);

    expect(created.title).toBe(`Course ${suffix}`);
    expect(created.description).toBeNull();
    expect(created.status).toBe(ContentStatus.DRAFT);

    const course = await getCourse(cookie, created.id).expect(200);
    expect(Object.keys(course.body).sort()).toEqual(
      ['createdAt', 'description', 'id', 'status', 'title', 'updatedAt'].sort(),
    );
    expect(course.body.title).toBe(created.title);

    const updated = await patchCourse(cookie, created.id, {
      title: '  Revised course  ',
      description: '  Course description  ',
    }).expect(200);
    expect(updated.body.title).toBe('Revised course');
    expect(updated.body.description).toBe('Course description');

    const cleared = await patchCourse(cookie, created.id, { description: null }).expect(200);
    expect(cleared.body.description).toBeNull();

    const limitCourse = await createCourse(cookie, 'T'.repeat(200), 'D'.repeat(2000));
    expect(limitCourse.title).toHaveLength(200);
    expect(limitCourse.description).toHaveLength(2000);
  });

  it('validates course fields and rejects unknown fields and empty patches', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const prefix = `Validation ${randomUUID().slice(0, 8)}`;

    for (const title of ['', '   ', 'x'.repeat(201)]) {
      await postCourse(cookie, { title }).expect(400);
    }
    await postCourse(cookie, { title: `${prefix} unknown`, extra: true }).expect(400);
    await postCourse(cookie, {
      title: `${prefix} description`,
      description: 'x'.repeat(2001),
    }).expect(400);

    const course = await createCourse(cookie, `${prefix} valid`);
    await patchCourse(cookie, course.id, {}).expect(400);
    await patchCourse(cookie, course.id, { title: null }).expect(400);
    await patchCourse(cookie, course.id, { title: `${prefix} unknown patch`, extra: true }).expect(
      400,
    );
    await patchCourseStatus(cookie, course.id, 'INVALID').expect(400);
  });

  it('paginates, filters by status, searches case-insensitively, and orders deterministically', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const suffix = randomUUID().slice(0, 8);
    const base = new Date('2026-01-01T00:00:00.000Z').getTime();
    const oldest = await createCourseRecord(`CUR3 ${suffix} Oldest`, new Date(base + 1_000));
    const tiedA = await createCourseRecord(`CUR3 ${suffix} Tie A`, new Date(base + 2_000));
    const tiedB = await createCourseRecord(`CUR3 ${suffix} Tie B`, new Date(base + 2_000));
    const newest = await createCourseRecord(`CUR3 ${suffix} Newest`, new Date(base + 3_000));
    await prisma.course.update({ where: { id: tiedA.id }, data: { status: ContentStatus.ACTIVE } });
    const tiesById = [tiedA, tiedB].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
    const q = `cur3 ${suffix}`;

    const firstPage = await getCourses(cookie, { q, page: 1, limit: 2 }).expect(200);
    await getCourses(cookie, { search: q }).expect(400);
    expect(firstPage.body.total).toBe(4);
    expect(firstPage.body.items.map((course: { id: string }) => course.id)).toEqual([
      newest.id,
      tiesById[0]!.id,
    ]);
    expect(firstPage.body.page).toBe(1);
    expect(firstPage.body.limit).toBe(2);

    const secondPage = await getCourses(cookie, { q, page: 2, limit: 2 }).expect(200);
    expect(secondPage.body.items.map((course: { id: string }) => course.id)).toEqual([
      tiesById[1]!.id,
      oldest.id,
    ]);

    const active = await getCourses(cookie, {
      q: suffix,
      status: ContentStatus.ACTIVE,
    }).expect(200);
    expect(active.body.items.map((course: { id: string }) => course.id)).toEqual([tiedA.id]);

    const draft = await getCourses(cookie, { q: suffix, status: ContentStatus.DRAFT }).expect(200);
    expect(draft.body.total).toBe(3);
  });

  it('changes status only along allowed transitions and reports conflicts safely', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const course = await createCourse(cookie, `Status ${randomUUID().slice(0, 8)}`);
    const discardDraft = await createCourse(cookie, `Discard draft ${randomUUID().slice(0, 8)}`);

    const archivedDraft = await patchCourseStatus(
      cookie,
      discardDraft.id,
      ContentStatus.ARCHIVED,
    ).expect(200);
    expect(archivedDraft.body.status).toBe(ContentStatus.ARCHIVED);
    await patchCourseStatus(cookie, course.id, ContentStatus.ACTIVE).expect(200);
    await patchCourseStatus(cookie, course.id, ContentStatus.ACTIVE).expect(200);
    const activeToDraft = await patchCourseStatus(cookie, course.id, ContentStatus.DRAFT).expect(
      409,
    );
    expect(activeToDraft.body.code).toBe('INVALID_STATUS_TRANSITION');

    await patchCourseStatus(cookie, course.id, ContentStatus.ARCHIVED).expect(200);
    const archivedToDraft = await patchCourseStatus(cookie, course.id, ContentStatus.DRAFT).expect(
      409,
    );
    expect(archivedToDraft.body.code).toBe('INVALID_STATUS_TRANSITION');
    await patchCourseStatus(cookie, course.id, ContentStatus.ACTIVE).expect(200);
  });

  it('deletes unused courses and rejects courses with related records', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const unused = await createCourse(cookie, `Delete ${randomUUID().slice(0, 8)}`);

    await deleteCourse(cookie, unused.id).expect(204);
    await getCourse(cookie, unused.id).expect(404);

    const inUse = await createCourse(cookie, `In use ${randomUUID().slice(0, 8)}`);
    await prisma.module.create({
      data: { courseId: inUse.id, title: 'Referenced module', position: 1 },
    });
    const conflict = await deleteCourse(cookie, inUse.id).expect(409);
    expect(conflict.body.code).toBe('COURSE_IN_USE');
    expectSafeError(conflict.body);
    await getCourse(cookie, inUse.id).expect(200);
  });

  it('archives active modules and lessons through database triggers without reviving descendants', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const course = await createCourse(cookie, `Cascade ${randomUUID().slice(0, 8)}`);
    await patchCourseStatus(cookie, course.id, ContentStatus.ACTIVE).expect(200);

    const activeModule = await prisma.module.create({
      data: { courseId: course.id, title: 'Active module', position: 1 },
    });
    await prisma.module.update({
      where: { id: activeModule.id },
      data: { status: ContentStatus.ACTIVE },
    });
    const draftModule = await prisma.module.create({
      data: { courseId: course.id, title: 'Draft module', position: 2 },
    });
    const activeLesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        moduleId: activeModule.id,
        title: 'Active lesson',
        position: 1,
      },
    });
    await prisma.lesson.update({
      where: { id: activeLesson.id },
      data: { status: ContentStatus.ACTIVE },
    });
    const draftLesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        moduleId: activeModule.id,
        title: 'Draft lesson',
        position: 2,
      },
    });
    const lessonInDraftModule = await prisma.lesson.create({
      data: {
        courseId: course.id,
        moduleId: draftModule.id,
        title: 'Lesson in draft module',
        position: 1,
      },
    });

    await patchCourseStatus(cookie, course.id, ContentStatus.ARCHIVED).expect(200);
    await expectCurriculumStatuses({
      activeModule: ContentStatus.ARCHIVED,
      draftModule: ContentStatus.DRAFT,
      activeLesson: ContentStatus.ARCHIVED,
      draftLesson: ContentStatus.DRAFT,
      lessonInDraftModule: ContentStatus.DRAFT,
    });

    await patchCourseStatus(cookie, course.id, ContentStatus.ACTIVE).expect(200);
    await expectCurriculumStatuses({
      activeModule: ContentStatus.ARCHIVED,
      draftModule: ContentStatus.DRAFT,
      activeLesson: ContentStatus.ARCHIVED,
      draftLesson: ContentStatus.DRAFT,
      lessonInDraftModule: ContentStatus.DRAFT,
    });

    async function expectCurriculumStatuses(statuses: {
      activeModule: ContentStatus;
      draftModule: ContentStatus;
      activeLesson: ContentStatus;
      draftLesson: ContentStatus;
      lessonInDraftModule: ContentStatus;
    }): Promise<void> {
      const [modules, lessons] = await Promise.all([
        prisma.module.findMany({
          where: { id: { in: [activeModule.id, draftModule.id] } },
          select: { id: true, status: true },
        }),
        prisma.lesson.findMany({
          where: { id: { in: [activeLesson.id, draftLesson.id, lessonInDraftModule.id] } },
          select: { id: true, status: true },
        }),
      ]);
      expect(modules.find(({ id }) => id === activeModule.id)?.status).toBe(statuses.activeModule);
      expect(modules.find(({ id }) => id === draftModule.id)?.status).toBe(statuses.draftModule);
      expect(lessons.find(({ id }) => id === activeLesson.id)?.status).toBe(statuses.activeLesson);
      expect(lessons.find(({ id }) => id === draftLesson.id)?.status).toBe(statuses.draftLesson);
      expect(lessons.find(({ id }) => id === lessonInDraftModule.id)?.status).toBe(
        statuses.lessonInDraftModule,
      );
    }
  });

  it('denies non-admin roles even when they have curriculum permissions', async () => {
    await request(app.getHttpServer()).get('/api/v1/courses').expect(401);
    const adminCookie = await loginAsCookie(app, fixture.admin);
    const course = await createCourse(adminCookie, `Denied access ${randomUUID().slice(0, 8)}`);
    await deleteCourse('', course.id).expect(401);

    for (const user of [fixture.schoolA.teacher, fixture.schoolA.student]) {
      const cookie = await loginAsCookie(app, user);
      await getCourses(cookie).expect(403);
      await getCourse(cookie, course.id).expect(403);
      await postCourse(cookie, { title: `Denied ${randomUUID().slice(0, 8)}` }).expect(403);
      await patchCourse(cookie, course.id, { title: 'Denied update' }).expect(403);
      await patchCourseStatus(cookie, course.id, ContentStatus.ACTIVE).expect(403);
      await deleteCourse(cookie, course.id).expect(403);
    }
  });

  it('returns 400 for malformed IDs and 404 for unknown UUIDs without exposing stack traces', async () => {
    const cookie = await loginAsCookie(app, fixture.admin);
    const unknownId = randomUUID();
    const unknownResponse = await getCourse(cookie, unknownId).expect(404);
    expect(unknownResponse.body.code).toBe('NOT_FOUND');
    expectSafeError(unknownResponse.body);

    const malformedGet = await getCourse(cookie, 'not-a-uuid').expect(400);
    expect(malformedGet.body.code).toBe('BAD_REQUEST');
    expectSafeError(malformedGet.body);

    const malformedPatch = await patchCourse(cookie, 'not-a-uuid', {
      title: 'Updated title',
    }).expect(400);
    expect(malformedPatch.body.code).toBe('BAD_REQUEST');
    const malformedStatus = await patchCourseStatus(
      cookie,
      'not-a-uuid',
      ContentStatus.ACTIVE,
    ).expect(400);
    expect(malformedStatus.body.code).toBe('BAD_REQUEST');
    const malformedDelete = await deleteCourse(cookie, 'not-a-uuid').expect(400);
    expect(malformedDelete.body.code).toBe('BAD_REQUEST');

    await patchCourse(cookie, randomUUID(), { title: 'Updated title' }).expect(404);
    await patchCourseStatus(cookie, randomUUID(), ContentStatus.ACTIVE).expect(404);
    const unknownDelete = await deleteCourse(cookie, randomUUID()).expect(404);
    expectSafeError(unknownDelete.body);
  });

  function expectSafeError(body: Record<string, unknown>): void {
    expect(body).toHaveProperty('requestId');
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toMatch(/node_modules|PrismaClient|at \w+\s*\(/);
  }
});
