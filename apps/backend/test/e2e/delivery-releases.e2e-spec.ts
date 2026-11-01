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
import {
  ContentStatus,
  DeliveryStatus,
  LessonAudience,
  PrismaClient,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';
import { loginAsCookie } from '../support/login.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';

describe('Delivery release endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let teacherCookie: string;
  let peerTeacherCookie: string;
  let studentCookie: string;
  let subscriptionId: string;
  let courseId: string;
  let deliverySequence = 0;
  let modulePosition = 0;
  const createdCourseIds: string[] = [];
  const createdModulePositions = new Map<string, number>();
  const revokeTeacherPermission: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Delivery release e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    revokeTeacherPermission.push(
      (await grantPermissions(setupClient, 'teacher', [PERMISSION.RELEASE_MANAGE])).revoke,
    );

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Delivery release e2e tests require a configured CORS_ORIGINS entry.');
    }

    fixture = await createTwoSchoolFixture(prisma);
    const course = await prisma.course.create({
      data: { title: `Release e2e ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    courseId = course.id;
    createdCourseIds.push(courseId);
    const subscription = await prisma.subscription.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        startDate: new Date('2000-01-01T00:00:00.000Z'),
        endDate: new Date('2099-12-31T00:00:00.000Z'),
        maxDeliveries: 1000,
      },
      select: { id: true },
    });
    subscriptionId = subscription.id;
    [adminCookie, teacherCookie, peerTeacherCookie, studentCookie] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, fixture.schoolB.teacher),
      loginAsCookie(app, fixture.schoolA.student),
    ]);
  });

  afterAll(async () => {
    if (fixture) {
      const schoolIds = [fixture.schoolA.school.id, fixture.schoolB.school.id];
      await prisma.$transaction(async (tx) => {
        await tx.deliveryLessonRelease.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.deliveryTeacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.deliveryEnrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.delivery.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.subscription.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.lesson.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.module.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.course.deleteMany({ where: { id: { in: createdCourseIds } } });
      });
      await cleanupFixtures(
        prisma,
        [
          fixture.admin.id,
          fixture.schoolA.teacher.id,
          fixture.schoolA.student.id,
          fixture.schoolB.teacher.id,
          fixture.schoolB.student.id,
        ],
        schoolIds,
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    for (const revoke of revokeTeacherPermission) {
      await revoke();
    }
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function createDelivery(status: DeliveryStatus = DeliveryStatus.ACTIVE): Promise<string> {
    deliverySequence += 1;
    const delivery = await prisma.delivery.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        classSectionId: fixture.schoolA.section.id,
        academicYear: `${2500 + deliverySequence}-01`,
        status,
      },
      select: { id: true },
    });
    return delivery.id;
  }

  async function createModule(
    status: ContentStatus = ContentStatus.ACTIVE,
    forCourseId = courseId,
  ): Promise<string> {
    modulePosition += 1;
    const module = await prisma.module.create({
      data: {
        courseId: forCourseId,
        title: `Release module ${randomUUID()}`,
        position: modulePosition,
        status,
      },
      select: { id: true },
    });
    createdModulePositions.set(module.id, 0);
    return module.id;
  }

  async function createLesson(
    moduleId: string,
    options: {
      status?: ContentStatus;
      audience?: LessonAudience;
      forCourseId?: string;
    } = {},
  ): Promise<string> {
    const position = (createdModulePositions.get(moduleId) ?? 0) + 1;
    createdModulePositions.set(moduleId, position);
    const lesson = await prisma.lesson.create({
      data: {
        moduleId,
        courseId: options.forCourseId ?? courseId,
        title: `Release lesson ${randomUUID()}`,
        position,
        status: options.status ?? ContentStatus.ACTIVE,
        audience: options.audience ?? LessonAudience.STUDENT,
      },
      select: { id: true },
    });
    return lesson.id;
  }

  function getReleases(cookie: string, deliveryId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/releases`)
      .set('Cookie', cookie);
  }

  function releaseLesson(cookie: string, deliveryId: string, lessonId: string) {
    return request(app.getHttpServer())
      .put(`/api/v1/deliveries/${deliveryId}/releases/lessons/${lessonId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function unreleaseLesson(cookie: string, deliveryId: string, lessonId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/releases/lessons/${lessonId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function releaseModule(cookie: string, deliveryId: string, moduleId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/releases/modules/${moduleId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function assignTeacher(deliveryId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/teachers`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ teacherId: fixture.schoolA.teacher.id });
  }

  it('requires authentication and release.manage and hides deliveries outside teacher assignment scope', async () => {
    const deliveryId = await createDelivery();
    await prisma.subscription.create({
      data: {
        schoolId: fixture.schoolB.school.id,
        courseId,
        startDate: new Date('2000-01-01T00:00:00.000Z'),
        endDate: new Date('2099-12-31T00:00:00.000Z'),
        maxDeliveries: 1000,
      },
    });
    const otherSchoolDelivery = await prisma.delivery.create({
      data: {
        schoolId: fixture.schoolB.school.id,
        courseId,
        classSectionId: fixture.schoolB.section.id,
        academicYear: '2600-01',
        status: DeliveryStatus.ACTIVE,
      },
      select: { id: true },
    });
    expectError(await getReleases('', deliveryId), 401, 'AUTHENTICATION_FAILED');
    expectError(await getReleases(studentCookie, deliveryId), 403, 'PERMISSION_REQUIRED');
    expectError(
      await releaseLesson(studentCookie, deliveryId, randomUUID()),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(
      await unreleaseLesson(studentCookie, deliveryId, randomUUID()),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(
      await releaseModule(studentCookie, deliveryId, randomUUID()),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(await getReleases(peerTeacherCookie, deliveryId), 404, 'NOT_FOUND');
    await getReleases(adminCookie, otherSchoolDelivery.id).expect(200);
    expectError(await getReleases(teacherCookie, otherSchoolDelivery.id), 404, 'NOT_FOUND');
    await assignTeacher(deliveryId).expect(201);
    await getReleases(teacherCookie, deliveryId).expect(200);
  });

  it('lists only active content and derives lesson and module release state', async () => {
    const deliveryId = await createDelivery();
    const activeModuleId = await createModule();
    const firstLessonId = await createLesson(activeModuleId);
    const secondLessonId = await createLesson(activeModuleId);
    const teacherOnlyLessonId = await createLesson(activeModuleId, {
      audience: LessonAudience.TEACHER_ONLY,
    });
    const draftLessonId = await createLesson(activeModuleId, { status: ContentStatus.DRAFT });
    const archivedLessonId = await createLesson(activeModuleId, {
      status: ContentStatus.ARCHIVED,
    });
    const draftModuleId = await createModule(ContentStatus.DRAFT);
    const draftModuleLessonId = await createLesson(draftModuleId, {
      status: ContentStatus.DRAFT,
    });
    const teacherOnlyModuleId = await createModule();
    const onlyTeacherLessonId = await createLesson(teacherOnlyModuleId, {
      audience: LessonAudience.TEACHER_ONLY,
    });

    const initial = await getReleases(adminCookie, deliveryId).expect(200);
    expect(initial.body.modules.map(({ id }: { id: string }) => id)).toEqual([
      activeModuleId,
      teacherOnlyModuleId,
    ]);
    expect(initial.body.modules[0]).toMatchObject({
      releaseState: 'NONE',
      releasedCount: 0,
      releasableLessonCount: 2,
    });
    expect(initial.body.modules[0].lessons.map(({ id }: { id: string }) => id)).toEqual([
      firstLessonId,
      secondLessonId,
      teacherOnlyLessonId,
    ]);
    expect(initial.body.modules[0].lessons[2]).toMatchObject({
      audience: LessonAudience.TEACHER_ONLY,
      released: false,
      releasedAt: null,
      releasable: false,
    });
    expect(initial.body.modules[1]).toMatchObject({
      id: teacherOnlyModuleId,
      releaseState: 'NONE',
      releasableLessonCount: 0,
    });
    expect(await releaseModule(adminCookie, deliveryId, teacherOnlyModuleId)).toMatchObject({
      status: 200,
      body: {
        moduleId: teacherOnlyModuleId,
        newlyReleased: 0,
        alreadyReleased: 0,
        skippedNotReleasable: 1,
      },
    });
    expect(
      initial.body.modules.flatMap(({ lessons }: { lessons: { id: string }[] }) =>
        lessons.map(({ id }) => id),
      ),
    ).not.toContain(draftLessonId);
    expect(
      initial.body.modules.flatMap(({ lessons }: { lessons: { id: string }[] }) =>
        lessons.map(({ id }) => id),
      ),
    ).not.toContain(archivedLessonId);
    expect(initial.body.modules.map(({ id }: { id: string }) => id)).not.toContain(draftModuleId);
    expect(initial.body.modules.map(({ id }: { id: string }) => id)).not.toContain(
      draftModuleLessonId,
    );
    expect(initial.body.modules[1].lessons[0].id).toBe(onlyTeacherLessonId);

    const first = await releaseLesson(adminCookie, deliveryId, firstLessonId).expect(200);
    expect(first.body).toMatchObject({ lessonId: firstLessonId, released: true });
    expect(new Date(first.body.releasedAt).toISOString()).toBe(first.body.releasedAt);
    const second = await releaseLesson(adminCookie, deliveryId, firstLessonId).expect(200);
    expect(second.body.releasedAt).toBe(first.body.releasedAt);
    expect(
      await prisma.deliveryLessonRelease.count({ where: { deliveryId, lessonId: firstLessonId } }),
    ).toBe(1);
    const partial = await getReleases(adminCookie, deliveryId).expect(200);
    expect(partial.body.modules[0]).toMatchObject({
      releaseState: 'PARTIAL',
      releasedCount: 1,
      releasableLessonCount: 2,
    });
    await releaseLesson(adminCookie, deliveryId, secondLessonId).expect(200);
    const all = await getReleases(adminCookie, deliveryId).expect(200);
    expect(all.body.modules[0].releaseState).toBe('ALL');

    const newLessonId = await createLesson(activeModuleId);
    const newLessonOutline = await getReleases(adminCookie, deliveryId).expect(200);
    expect(newLessonOutline.body.modules[0]).toMatchObject({
      releaseState: 'PARTIAL',
      releasableLessonCount: 3,
      releasedCount: 2,
    });
    expect(
      newLessonOutline.body.modules[0].lessons.find(({ id }: { id: string }) => id === newLessonId),
    ).toMatchObject({ released: false, releasable: true });

    await unreleaseLesson(adminCookie, deliveryId, firstLessonId).expect(204);
    await unreleaseLesson(adminCookie, deliveryId, firstLessonId).expect(204);
    const afterRemoval = await getReleases(adminCookie, deliveryId).expect(200);
    expect(
      afterRemoval.body.modules[0].lessons.find(({ id }: { id: string }) => id === firstLessonId),
    ).toMatchObject({ released: false, releasedAt: null });
  });

  it('rejects ineligible lessons and hides lessons from other courses', async () => {
    const deliveryId = await createDelivery();
    const activeModuleId = await createModule();
    const teacherOnlyLessonId = await createLesson(activeModuleId, {
      audience: LessonAudience.TEACHER_ONLY,
    });
    const draftLessonId = await createLesson(activeModuleId, { status: ContentStatus.DRAFT });
    const archivedLessonId = await createLesson(activeModuleId, {
      status: ContentStatus.ARCHIVED,
    });
    const inactiveModuleId = await createModule(ContentStatus.DRAFT);
    const inactiveModuleLessonId = await createLesson(inactiveModuleId, {
      status: ContentStatus.DRAFT,
    });
    const otherCourse = await prisma.course.create({
      data: { title: `Other release course ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    createdCourseIds.push(otherCourse.id);
    const otherModuleId = await createModule(ContentStatus.ACTIVE, otherCourse.id);
    const otherLessonId = await createLesson(otherModuleId, { forCourseId: otherCourse.id });

    const ineligibleCases: { lessonId: string; reason: string }[] = [
      { lessonId: teacherOnlyLessonId, reason: 'TEACHER_ONLY' },
      { lessonId: draftLessonId, reason: 'LESSON_DRAFT' },
      { lessonId: archivedLessonId, reason: 'LESSON_ARCHIVED' },
      { lessonId: inactiveModuleLessonId, reason: 'MODULE_NOT_ACTIVE' },
    ];
    for (const { lessonId, reason } of ineligibleCases) {
      const response = await releaseLesson(adminCookie, deliveryId, lessonId);
      expectError(response, 409, 'LESSON_NOT_RELEASABLE');
      expect(response.body.details).toEqual({ reason });
    }
    expectError(
      await releaseLesson(adminCookie, deliveryId, otherLessonId),
      404,
      'LESSON_NOT_FOUND',
    );
    expectError(
      await unreleaseLesson(adminCookie, deliveryId, otherLessonId),
      404,
      'LESSON_NOT_FOUND',
    );
    expectError(
      await releaseModule(adminCookie, deliveryId, inactiveModuleId),
      409,
      'MODULE_NOT_ACTIVE',
    );
    expect(activeModuleId).toBeTruthy();
  });

  it('bulk releases only eligible module lessons and is idempotent', async () => {
    const deliveryId = await createDelivery();
    const moduleId = await createModule();
    const alreadyReleasedId = await createLesson(moduleId);
    await createLesson(moduleId);
    await createLesson(moduleId, { audience: LessonAudience.TEACHER_ONLY });
    await createLesson(moduleId, { status: ContentStatus.DRAFT });
    await createLesson(moduleId, { status: ContentStatus.ARCHIVED });
    await releaseLesson(adminCookie, deliveryId, alreadyReleasedId).expect(200);

    const result = await releaseModule(adminCookie, deliveryId, moduleId).expect(200);
    expect(result.body).toEqual({
      moduleId,
      newlyReleased: 1,
      alreadyReleased: 1,
      skippedNotReleasable: 3,
    });
    const repeated = await releaseModule(adminCookie, deliveryId, moduleId).expect(200);
    expect(repeated.body).toEqual({
      moduleId,
      newlyReleased: 0,
      alreadyReleased: 2,
      skippedNotReleasable: 3,
    });
    expect(await prisma.deliveryLessonRelease.count({ where: { deliveryId } })).toBe(2);
  });

  it('gates lesson and module release by subscription but allows reads and cleanup, then works after renewal', async () => {
    const deliveryId = await createDelivery();
    const moduleId = await createModule();
    const lessonId = await createLesson(moduleId);
    await assignTeacher(deliveryId).expect(201);
    await releaseLesson(adminCookie, deliveryId, lessonId).expect(200);
    const [yesterday] = await prisma.$queryRaw<{ yesterday: string }[]>`
      SELECT (business_today() - 1)::text AS yesterday
    `;
    if (!yesterday) {
      throw new Error('business_today() did not return a date');
    }
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { endDate: new Date(`${yesterday.yesterday}T00:00:00.000Z`) },
    });

    expectError(
      await releaseLesson(adminCookie, deliveryId, lessonId),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    expectError(
      await releaseLesson(teacherCookie, deliveryId, lessonId),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    expectError(
      await releaseModule(adminCookie, deliveryId, moduleId),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    expectError(
      await releaseModule(teacherCookie, deliveryId, moduleId),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    await getReleases(adminCookie, deliveryId).expect(200);
    await getReleases(teacherCookie, deliveryId).expect(200);
    await unreleaseLesson(teacherCookie, deliveryId, lessonId).expect(204);

    const renewed = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${subscriptionId}/renew`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ endDate: '2099-12-31' })
      .expect(201);
    expect(renewed.body.id).not.toBe(subscriptionId);
    await releaseLesson(adminCookie, deliveryId, lessonId).expect(200);
  });

  it('allows outline reads and cleanup on inactive deliveries but rejects release writes', async () => {
    const deliveryId = await createDelivery();
    const moduleId = await createModule();
    const lessonId = await createLesson(moduleId);
    await releaseLesson(adminCookie, deliveryId, lessonId).expect(200);
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    await getReleases(adminCookie, deliveryId).expect(200);
    await unreleaseLesson(adminCookie, deliveryId, lessonId).expect(204);
    expectError(await releaseLesson(adminCookie, deliveryId, lessonId), 409, 'DELIVERY_NOT_ACTIVE');
    expectError(await releaseModule(adminCookie, deliveryId, moduleId), 409, 'DELIVERY_NOT_ACTIVE');
  });

  it('allows removing a release after its lesson is archived', async () => {
    const deliveryId = await createDelivery();
    const moduleId = await createModule();
    const lessonId = await createLesson(moduleId);
    await assignTeacher(deliveryId).expect(201);
    await releaseLesson(adminCookie, deliveryId, lessonId).expect(200);
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { status: ContentStatus.ARCHIVED },
    });

    await unreleaseLesson(teacherCookie, deliveryId, lessonId).expect(204);
    expect(
      await prisma.deliveryLessonRelease.findUnique({
        where: { deliveryId_lessonId: { deliveryId, lessonId } },
      }),
    ).toBeNull();
  });
});
