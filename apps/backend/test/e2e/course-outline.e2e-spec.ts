/** Covers the unpaginated course outline read model and its authorization boundary. */
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
import { ContentStatus, LessonAudience, PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { createTestApp } from '../support/create-test-app.js';
import { loginAsCookie } from '../support/login.js';

type LessonSeed = {
  title: string;
  position: number;
  status?: ContentStatus;
  audience?: LessonAudience;
};

type ModuleSeed = {
  title: string;
  position: number;
  status?: ContentStatus;
  lessons?: LessonSeed[];
};

describe('Course outline endpoint (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  const createdCourseIds: string[] = [];
  let revokeTeacherPermissions: (() => Promise<void>) | undefined;
  let revokeStudentPermissions: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Course outline e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const curriculumRead = [PERMISSION.CURRICULUM_READ];
    const teacherGrant = await grantPermissions(setupClient, 'teacher', curriculumRead);
    const studentGrant = await grantPermissions(setupClient, 'student', curriculumRead);
    revokeTeacherPermissions = teacherGrant.revoke;
    revokeStudentPermissions = studentGrant.revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    fixture = await createTwoSchoolFixture(prisma);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Course outline e2e tests require a configured CORS_ORIGINS entry.');
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

  beforeEach(async () => {
    adminCookie = await loginAsCookie(app, fixture.admin);
  });

  function getOutline(cookie: string, courseId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}/outline`)
      .set('Cookie', cookie);
  }

  async function createCourse(
    title: string,
    modules: ModuleSeed[] = [],
    status: ContentStatus = ContentStatus.DRAFT,
  ) {
    const course = await prisma.course.create({
      data: { title, status },
      select: { id: true },
    });
    createdCourseIds.push(course.id);
    const createdModules = [];
    for (const module of modules) {
      createdModules.push(
        await prisma.module.create({
          data: {
            courseId: course.id,
            title: module.title,
            position: module.position,
            status: module.status ?? ContentStatus.DRAFT,
            lessons: {
              create: (module.lessons ?? []).map((lesson) => ({
                title: lesson.title,
                position: lesson.position,
                status: lesson.status ?? ContentStatus.DRAFT,
                audience: lesson.audience ?? LessonAudience.TEACHER_ONLY,
              })),
            },
          },
          select: {
            id: true,
            title: true,
            position: true,
            lessons: { select: { id: true, title: true, position: true } },
          },
        }),
      );
    }
    return { course, modules: createdModules };
  }

  it('returns only the complete nested fields ordered by position at both levels', async () => {
    const courseTitle = `Outline ${randomUUID()}`;
    const { course, modules } = await createCourse(courseTitle, [
      {
        title: 'Later module',
        position: 8,
        lessons: [
          { title: 'Later lesson', position: 9, audience: LessonAudience.STUDENT },
          { title: 'Earlier lesson', position: 2 },
        ],
      },
      {
        title: 'Earlier module',
        position: 3,
        lessons: [{ title: 'Only lesson', position: 5 }],
      },
    ]);

    const response = await getOutline(adminCookie, course.id).expect(200);
    expect(Object.keys(response.body).sort()).toEqual(['course', 'modules'].sort());
    expect(Object.keys(response.body.course).sort()).toEqual(
      ['description', 'id', 'status', 'title'].sort(),
    );
    expect(response.body.course).toEqual({
      id: course.id,
      title: courseTitle,
      description: null,
      status: ContentStatus.DRAFT,
    });
    expect(response.body.modules.map((module: { id: string }) => module.id)).toEqual([
      modules[1]!.id,
      modules[0]!.id,
    ]);
    expect(Object.keys(response.body.modules[0]).sort()).toEqual(
      ['id', 'lessons', 'position', 'status', 'title'].sort(),
    );
    expect(
      response.body.modules[1].lessons.map((lesson: { position: number }) => lesson.position),
    ).toEqual([2, 9]);
    expect(Object.keys(response.body.modules[1].lessons[0]).sort()).toEqual(
      ['audience', 'id', 'position', 'status', 'title'].sort(),
    );
  });

  it('returns statuses and lesson audiences without filtering draft, active, or archived content', async () => {
    const { course } = await createCourse(
      `Statuses ${randomUUID()}`,
      [
        {
          title: 'Draft module',
          position: 1,
          status: ContentStatus.DRAFT,
          lessons: [{ title: 'Draft lesson', position: 1, status: ContentStatus.DRAFT }],
        },
        {
          title: 'Active module',
          position: 2,
          status: ContentStatus.ACTIVE,
          lessons: [
            {
              title: 'Active student lesson',
              position: 1,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.STUDENT,
            },
            {
              title: 'Archived lesson',
              position: 2,
              status: ContentStatus.ARCHIVED,
            },
          ],
        },
        {
          title: 'Archived module',
          position: 3,
          status: ContentStatus.ARCHIVED,
          lessons: [{ title: 'Archived descendant', position: 1, status: ContentStatus.ARCHIVED }],
        },
      ],
      ContentStatus.ACTIVE,
    );

    const response = await getOutline(adminCookie, course.id).expect(200);
    expect(response.body.course.status).toBe(ContentStatus.ACTIVE);
    expect(response.body.modules.map((module: { status: ContentStatus }) => module.status)).toEqual(
      [ContentStatus.DRAFT, ContentStatus.ACTIVE, ContentStatus.ARCHIVED],
    );
    expect(
      response.body.modules.map((module: { lessons: Array<{ status: ContentStatus }> }) =>
        module.lessons.map((lesson) => lesson.status),
      ),
    ).toEqual([
      [ContentStatus.DRAFT],
      [ContentStatus.ACTIVE, ContentStatus.ARCHIVED],
      [ContentStatus.ARCHIVED],
    ]);
    expect(response.body.modules[1].lessons[0].audience).toBe(LessonAudience.STUDENT);
  });

  it('returns an empty module list and empty lessons for modules without lessons', async () => {
    const empty = await createCourse(`Empty ${randomUUID()}`);
    const withEmptyModule = await createCourse(`No lessons ${randomUUID()}`, [
      { title: 'Empty module', position: 1 },
    ]);

    expect((await getOutline(adminCookie, empty.course.id).expect(200)).body.modules).toEqual([]);
    expect(
      (await getOutline(adminCookie, withEmptyModule.course.id).expect(200)).body.modules[0]
        .lessons,
    ).toEqual([]);
  });

  it('reflects reordering, moving, deleting, and archive cascades on subsequent reads', async () => {
    const { course, modules } = await createCourse(
      `Mutable outline ${randomUUID()}`,
      [
        {
          title: 'First',
          position: 1,
          status: ContentStatus.ACTIVE,
          lessons: [
            { title: 'Move me', position: 1, status: ContentStatus.ACTIVE },
            { title: 'Delete me', position: 2, status: ContentStatus.ACTIVE },
            { title: 'Keep draft', position: 3 },
          ],
        },
        {
          title: 'Second',
          position: 2,
          status: ContentStatus.ACTIVE,
          lessons: [{ title: 'Second lesson', position: 1, status: ContentStatus.ACTIVE }],
        },
      ],
      ContentStatus.ACTIVE,
    );
    const first = modules[0]!;
    const second = modules[1]!;
    const movingLesson = first.lessons.find((lesson) => lesson.title === 'Move me')!;
    const deletingLesson = first.lessons.find((lesson) => lesson.title === 'Delete me')!;

    await request(app.getHttpServer())
      .put(`/api/v1/courses/${course.id}/modules/order`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ moduleIds: [second.id, first.id] })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/modules/${first.id}/lessons/order`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ lessonIds: [deletingLesson.id, movingLesson.id, first.lessons[2]!.id] })
      .expect(200);
    let response = await getOutline(adminCookie, course.id).expect(200);
    expect(response.body.modules.map((module: { id: string }) => module.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(response.body.modules[1].lessons.map((lesson: { id: string }) => lesson.id)).toEqual([
      deletingLesson.id,
      movingLesson.id,
      first.lessons[2]!.id,
    ]);

    await prisma.lesson.update({
      where: { id: movingLesson.id },
      data: { moduleId: second.id, position: 2 },
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/lessons/${deletingLesson.id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(204);
    response = await getOutline(adminCookie, course.id).expect(200);
    expect(response.body.modules[0].lessons.map((lesson: { id: string }) => lesson.id)).toEqual([
      second.lessons[0]!.id,
      movingLesson.id,
    ]);
    expect(response.body.modules[1].lessons.map((lesson: { id: string }) => lesson.id)).toEqual([
      first.lessons[2]!.id,
    ]);

    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${course.id}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status: ContentStatus.ARCHIVED })
      .expect(200);
    response = await getOutline(adminCookie, course.id).expect(200);
    expect(response.body.course.status).toBe(ContentStatus.ARCHIVED);
    expect(response.body.modules.map((module: { status: ContentStatus }) => module.status)).toEqual(
      [ContentStatus.ARCHIVED, ContentStatus.ARCHIVED],
    );
    expect(
      response.body.modules.flatMap((module: { lessons: Array<{ status: ContentStatus }> }) =>
        module.lessons.map((lesson) => lesson.status),
      ),
    ).toEqual([ContentStatus.ARCHIVED, ContentStatus.ARCHIVED, ContentStatus.DRAFT]);
  });

  it('preserves ordering when deleted modules and lessons leave position gaps', async () => {
    const { course, modules } = await createCourse(`Gaps ${randomUUID()}`, [
      {
        title: 'Position ten',
        position: 10,
        lessons: [
          { title: 'Lesson ten', position: 10 },
          { title: 'Lesson thirty', position: 30 },
        ],
      },
      { title: 'Deleted module', position: 20 },
      { title: 'Position thirty', position: 30 },
    ]);
    const deletedModule = modules[1]!;
    const laterLesson = modules[0]!.lessons[1]!;

    await request(app.getHttpServer())
      .delete(`/api/v1/modules/${deletedModule.id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/lessons/${modules[0]!.lessons[0]!.id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(204);

    const response = await getOutline(adminCookie, course.id).expect(200);
    expect(response.body.modules.map((module: { position: number }) => module.position)).toEqual([
      10, 30,
    ]);
    expect(
      response.body.modules[0].lessons.map((lesson: { position: number }) => lesson.position),
    ).toEqual([30]);
    expect(response.body.modules[0].lessons[0].id).toBe(laterLesson.id);
  });

  it('returns every item in a large outline in deterministic order', async () => {
    const modules = Array.from({ length: 20 }, (_, moduleIndex) => ({
      title: `Module ${moduleIndex + 1}`,
      position: moduleIndex + 1,
      lessons: Array.from({ length: 10 }, (_, lessonIndex) => ({
        title: `Lesson ${lessonIndex + 1}`,
        position: lessonIndex + 1,
      })),
    }));
    const { course } = await createCourse(`Large outline ${randomUUID()}`, modules);

    const response = await getOutline(adminCookie, course.id).expect(200);
    expect(response.body.modules).toHaveLength(20);
    expect(
      response.body.modules.every(
        (module: { lessons: unknown[] }, index: number) =>
          module.lessons.length === 10 && response.body.modules[index].position === index + 1,
      ),
    ).toBe(true);
    expect(
      response.body.modules.every((module: { lessons: Array<{ position: number }> }) =>
        module.lessons.every((lesson, index) => lesson.position === index + 1),
      ),
    ).toBe(true);
  });

  it('returns 404 for unknown and malformed IDs, 401 without a cookie, and 403 for school users', async () => {
    await getOutline(adminCookie, randomUUID()).expect(404);
    await getOutline(adminCookie, 'not-a-uuid').expect(404);
    await getOutline('', randomUUID()).expect(401);

    const teacherCookie = await loginAsCookie(app, fixture.schoolA.teacher);
    const studentCookie = await loginAsCookie(app, fixture.schoolA.student);
    await getOutline(teacherCookie, randomUUID()).expect(403);
    await getOutline(studentCookie, randomUUID()).expect(403);
  });
});
