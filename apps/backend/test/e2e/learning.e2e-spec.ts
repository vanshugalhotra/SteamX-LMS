import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import {
  ContentStatus,
  DeliveryStatus,
  EnrollmentStatus,
  AssetFileStatus,
  AssetType,
  BlockType,
  LessonAudience,
  PrismaClient,
} from '../../src/generated/prisma/client.js';
import type { Env } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import {
  createTestClassSection,
  createTestStudent,
  createTwoSchoolFixture,
  TENANCY_TEST_PASSWORD,
  type TestUserFixture,
  type TwoSchoolFixture,
} from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { createTestApp } from '../support/create-test-app.js';
import { loginAsCookie } from '../support/login.js';
import { createTestAsset, createTestAssetFile } from '../support/factories/assets.js';
import { createTestAssetWithReadyFile } from '../support/factories/curriculum.js';

type LearningDeliverySet = {
  firstYear: string;
  secondYear: string;
  completed: string;
  removed: string;
  inactive: string;
  anotherStudent: string;
  anotherClass: string;
  expired: string;
  foreign: string;
  noRelease: string;
};

describe('Student learning navigation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let studentCookie: string;
  let teacherCookie: string;
  let peerTeacherCookie: string;
  let adminCookie: string;
  let unenrolledCookie: string;
  let unenrolledStudent: TestUserFixture;
  let otherClassStudent: TestUserFixture;
  let otherClassSectionId: string;
  let origin: string;
  let alphaCourseId: string;
  let betaCourseId: string;
  let foreignCourseId: string;
  let outlineModuleId: string;
  let archivedModuleId: string;
  let activeLessonId: string;
  let archivedLessonId: string;
  let archivedModuleLessonId: string;
  let teacherOnlyLessonId: string;
  let unreleasedLessonId: string;
  let draftLessonId: string;
  let expiredLessonId: string;
  let readyAssetId: string;
  let failedAssetId: string;
  let deliveries: LearningDeliverySet;
  const createdCourseIds: string[] = [];
  const createdDeliveryIds: string[] = [];
  const createdAssetIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSectionIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Learning e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    origin =
      app.get<ConfigService<Env, true>>(ConfigService).get('CORS_ORIGINS', { infer: true })[0] ??
      '';
    if (!origin) {
      throw new Error('Learning e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);

    const testPasswordHash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);
    const {
      section: otherClassSection,
      unenrolledStudent: createdUnenrolledStudent,
      otherClassStudent: createdOtherClassStudent,
    } = await prisma.$transaction(async (tx) => {
      const otherClassSection = await createTestClassSection(
        tx,
        fixture.schoolA.school.id,
        `Learning other class ${randomUUID().slice(0, 8)}`,
      );
      const unenrolledStudent = await createTestStudent(
        tx,
        fixture.schoolA.school.id,
        fixture.schoolA.section.id,
        testPasswordHash,
        'Learning unenrolled student',
      );
      const otherClassStudent = await createTestStudent(
        tx,
        fixture.schoolA.school.id,
        otherClassSection.id,
        testPasswordHash,
        'Learning other class student',
      );
      return { section: otherClassSection, unenrolledStudent, otherClassStudent };
    });
    otherClassSectionId = otherClassSection.id;
    unenrolledStudent = createdUnenrolledStudent;
    otherClassStudent = createdOtherClassStudent;
    createdUserIds.push(unenrolledStudent.id, otherClassStudent.id);
    createdSectionIds.push(otherClassSectionId);

    [studentCookie, teacherCookie, peerTeacherCookie, adminCookie, unenrolledCookie] =
      await Promise.all([
        loginAsCookie(app, fixture.schoolA.student),
        loginAsCookie(app, fixture.schoolA.teacher),
        loginAsCookie(app, fixture.schoolB.teacher),
        loginAsCookie(app, fixture.admin),
        loginAsCookie(app, unenrolledStudent),
      ]);

    await createLearningFixtures();
    await assignTeacher(deliveries.firstYear).expect(201);
  });

  afterAll(async () => {
    if (prisma && createdDeliveryIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        const lessonIds = (
          await tx.lesson.findMany({
            where: { courseId: { in: createdCourseIds } },
            select: { id: true },
          })
        ).map(({ id }) => id);
        await tx.lessonBlock.deleteMany({ where: { lessonId: { in: lessonIds } } });
        await tx.lessonCompletion.deleteMany({
          where: { deliveryId: { in: createdDeliveryIds } },
        });
        await tx.deliveryLessonRelease.deleteMany({
          where: { deliveryId: { in: createdDeliveryIds } },
        });
        await tx.deliveryEnrollment.deleteMany({
          where: { deliveryId: { in: createdDeliveryIds } },
        });
        await tx.deliveryTeacher.deleteMany({
          where: { deliveryId: { in: createdDeliveryIds } },
        });
        await tx.delivery.deleteMany({ where: { id: { in: createdDeliveryIds } } });
        await tx.subscription.deleteMany({
          where: {
            schoolId: { in: [fixture.schoolA.school.id, fixture.schoolB.school.id] },
            courseId: { in: createdCourseIds },
          },
        });
        await tx.lesson.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.module.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.course.deleteMany({ where: { id: { in: createdCourseIds } } });
      });
    }
    if (createdAssetIds.length > 0) {
      await prisma.assetFile.deleteMany({ where: { assetId: { in: createdAssetIds } } });
      await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
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
          ...createdUserIds,
        ],
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id, ...createdSectionIds],
      );
    }
    await app?.close();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function createLearningFixtures(): Promise<void> {
    alphaCourseId = await createCourse('LRN-2 Alpha');
    betaCourseId = await createCourse('LRN-2 Beta');
    foreignCourseId = await createCourse('LRN-2 Foreign');
    await createSubscription(fixture.schoolA.school.id, alphaCourseId);
    await createSubscription(fixture.schoolA.school.id, betaCourseId);
    await createSubscription(fixture.schoolB.school.id, foreignCourseId);

    const alphaDeliveries = await Promise.all([
      createDelivery(
        fixture.schoolA.school.id,
        alphaCourseId,
        fixture.schoolA.section.id,
        '2026-27',
      ),
      createDelivery(
        fixture.schoolA.school.id,
        alphaCourseId,
        fixture.schoolA.section.id,
        '2027-28',
      ),
      createDelivery(
        fixture.schoolA.school.id,
        alphaCourseId,
        fixture.schoolA.section.id,
        '2025-26',
      ),
      createDelivery(
        fixture.schoolA.school.id,
        alphaCourseId,
        fixture.schoolA.section.id,
        '2024-25',
      ),
      createDelivery(
        fixture.schoolA.school.id,
        alphaCourseId,
        fixture.schoolA.section.id,
        '2023-24',
      ),
      createDelivery(
        fixture.schoolA.school.id,
        alphaCourseId,
        fixture.schoolA.section.id,
        '2022-23',
      ),
      createDelivery(fixture.schoolA.school.id, alphaCourseId, otherClassSectionId, '2021-22'),
    ]);
    const expiredDelivery = await createDelivery(
      fixture.schoolA.school.id,
      betaCourseId,
      fixture.schoolA.section.id,
      '2026-27',
    );
    const foreignDelivery = await createDelivery(
      fixture.schoolB.school.id,
      foreignCourseId,
      fixture.schoolB.section.id,
      '2026-27',
    );
    const noReleaseDelivery = await createDelivery(
      fixture.schoolA.school.id,
      alphaCourseId,
      fixture.schoolA.section.id,
      '2020-21',
    );
    deliveries = {
      firstYear: alphaDeliveries[0]!,
      secondYear: alphaDeliveries[1]!,
      completed: alphaDeliveries[2]!,
      removed: alphaDeliveries[3]!,
      inactive: alphaDeliveries[4]!,
      anotherStudent: alphaDeliveries[5]!,
      anotherClass: alphaDeliveries[6]!,
      expired: expiredDelivery,
      foreign: foreignDelivery,
      noRelease: noReleaseDelivery,
    };

    await Promise.all([
      enroll(deliveries.firstYear, fixture.schoolA.student.id, fixture.schoolA.school.id),
      enroll(deliveries.secondYear, fixture.schoolA.student.id, fixture.schoolA.school.id),
      enroll(
        deliveries.completed,
        fixture.schoolA.student.id,
        fixture.schoolA.school.id,
        EnrollmentStatus.COMPLETED,
      ),
      enroll(
        deliveries.removed,
        fixture.schoolA.student.id,
        fixture.schoolA.school.id,
        EnrollmentStatus.REMOVED,
      ),
      enroll(deliveries.inactive, fixture.schoolA.student.id, fixture.schoolA.school.id),
      enroll(deliveries.anotherStudent, unenrolledStudent.id, fixture.schoolA.school.id),
      enroll(deliveries.anotherClass, otherClassStudent.id, fixture.schoolA.school.id),
      enroll(deliveries.expired, fixture.schoolA.student.id, fixture.schoolA.school.id),
      enroll(deliveries.foreign, fixture.schoolB.student.id, fixture.schoolB.school.id),
    ]);
    await prisma.delivery.update({
      where: { id: deliveries.inactive },
      data: { status: DeliveryStatus.INACTIVE },
    });

    const createdModules = await createOutlineLessons();
    outlineModuleId = createdModules.outlineModuleId;
    archivedModuleId = createdModules.archivedModuleId;
    ({
      activeLessonId,
      archivedLessonId,
      archivedModuleLessonId,
      teacherOnlyLessonId,
      unreleasedLessonId,
      draftLessonId,
    } = createdModules);

    for (const deliveryId of [deliveries.firstYear, deliveries.secondYear]) {
      await prisma.deliveryLessonRelease.createMany({
        data: [activeLessonId, archivedLessonId, archivedModuleLessonId].map((lessonId) => ({
          deliveryId,
          lessonId,
          schoolId: fixture.schoolA.school.id,
          courseId: alphaCourseId,
        })),
      });
    }
    await prisma.lessonCompletion.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId: deliveries.firstYear,
        studentId: fixture.schoolA.student.id,
        lessonId: activeLessonId,
        courseId: alphaCourseId,
      },
    });
    await prisma.lesson.update({
      where: { id: archivedLessonId },
      data: { status: ContentStatus.ARCHIVED },
    });
    await prisma.module.update({
      where: { id: archivedModuleId },
      data: { status: ContentStatus.ARCHIVED },
    });
    const expiredModule = await prisma.module.create({
      data: {
        courseId: betaCourseId,
        title: 'Expired subscription module',
        position: 1,
        status: ContentStatus.ACTIVE,
        lessons: {
          create: {
            title: 'Expired subscription lesson',
            position: 1,
            status: ContentStatus.ACTIVE,
            audience: LessonAudience.STUDENT,
          },
        },
      },
      select: { lessons: { select: { id: true } } },
    });
    expiredLessonId = expiredModule.lessons[0]!.id;
    await prisma.deliveryLessonRelease.create({
      data: {
        deliveryId: deliveries.expired,
        lessonId: expiredLessonId,
        schoolId: fixture.schoolA.school.id,
        courseId: betaCourseId,
      },
    });
    await createLessonContentFixtures();
    await expireSubscription(fixture.schoolA.school.id, betaCourseId);
  }

  async function createLessonContentFixtures(): Promise<void> {
    const readyAsset = await createTestAssetWithReadyFile(prisma, AssetType.IMAGE, {
      title: 'Ready learning image',
      sizeBytes: 1024,
    });
    readyAssetId = readyAsset.assetId;
    createdAssetIds.push(readyAssetId);
    const failedAsset = await createTestAsset(prisma, {
      type: AssetType.IMAGE,
      title: 'Failed learning image',
    });
    failedAssetId = failedAsset;
    createdAssetIds.push(failedAssetId);
    await createTestAssetFile(prisma, failedAsset, AssetFileStatus.FAILED, 'image/png', {
      lastError: 'Hidden processing detail',
    });

    const richText = {
      format: 'tiptap',
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lesson text' }] }],
      },
    };
    const layout = await prisma.lessonBlock.create({
      data: {
        lessonId: activeLessonId,
        type: BlockType.TWO_COLUMN,
        content: {},
        position: 2,
      },
      select: { id: true },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: activeLessonId,
        type: BlockType.RICH_TEXT,
        content: richText,
        position: 1,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: activeLessonId,
        type: BlockType.IMAGE,
        assetId: readyAssetId,
        content: { alt: 'Two-column image' },
        parentBlockId: layout.id,
        columnIndex: 0,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: activeLessonId,
        type: BlockType.RICH_TEXT,
        content: richText,
        parentBlockId: layout.id,
        columnIndex: 1,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: activeLessonId,
        type: BlockType.ACCORDION,
        content: { title: 'More details', body: richText },
        position: 3,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: activeLessonId,
        type: BlockType.IMAGE,
        assetId: failedAssetId,
        content: { alt: 'Image without a ready file' },
        position: 4,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: archivedLessonId,
        type: BlockType.RICH_TEXT,
        content: richText,
        position: 1,
      },
    });
  }

  async function createOutlineLessons(): Promise<{
    outlineModuleId: string;
    archivedModuleId: string;
    activeLessonId: string;
    archivedLessonId: string;
    archivedModuleLessonId: string;
    teacherOnlyLessonId: string;
    unreleasedLessonId: string;
    draftLessonId: string;
  }> {
    const outlineModule = await prisma.module.create({
      data: {
        courseId: alphaCourseId,
        title: 'Visible module',
        position: 2,
        status: ContentStatus.ACTIVE,
        lessons: {
          create: [
            {
              title: 'Completed student lesson',
              position: 1,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.STUDENT,
            },
            {
              title: 'Archived student lesson',
              position: 2,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.STUDENT,
            },
            {
              title: 'Teacher-only lesson',
              position: 3,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.TEACHER_ONLY,
            },
            {
              title: 'Unreleased lesson',
              position: 4,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.STUDENT,
            },
            {
              title: 'Draft lesson',
              position: 5,
              status: ContentStatus.DRAFT,
              audience: LessonAudience.STUDENT,
            },
          ],
        },
      },
      select: {
        id: true,
        lessons: { select: { id: true, title: true } },
      },
    });
    const archivedModule = await prisma.module.create({
      data: {
        courseId: alphaCourseId,
        title: 'Archived module',
        position: 4,
        status: ContentStatus.ACTIVE,
        lessons: {
          create: [
            {
              title: 'Archived module lesson',
              position: 1,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.STUDENT,
            },
          ],
        },
      },
      select: { id: true, lessons: { select: { id: true } } },
    });
    await prisma.module.create({
      data: {
        courseId: alphaCourseId,
        title: 'Empty module',
        position: 3,
        status: ContentStatus.ACTIVE,
        lessons: {
          create: [
            {
              title: 'Only unreleased lesson',
              position: 1,
              status: ContentStatus.ACTIVE,
              audience: LessonAudience.STUDENT,
            },
          ],
        },
      },
    });

    return {
      outlineModuleId: outlineModule.id,
      archivedModuleId: archivedModule.id,
      activeLessonId: outlineModule.lessons.find(
        (lesson) => lesson.title === 'Completed student lesson',
      )!.id,
      archivedLessonId: outlineModule.lessons.find(
        (lesson) => lesson.title === 'Archived student lesson',
      )!.id,
      teacherOnlyLessonId: outlineModule.lessons.find(
        (lesson) => lesson.title === 'Teacher-only lesson',
      )!.id,
      unreleasedLessonId: outlineModule.lessons.find(
        (lesson) => lesson.title === 'Unreleased lesson',
      )!.id,
      draftLessonId: outlineModule.lessons.find((lesson) => lesson.title === 'Draft lesson')!.id,
      archivedModuleLessonId: archivedModule.lessons[0]!.id,
    };
  }

  async function createCourse(title: string): Promise<string> {
    const course = await prisma.course.create({
      data: { title: `${title} ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    createdCourseIds.push(course.id);
    return course.id;
  }

  async function createSubscription(schoolId: string, courseId: string): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO subscriptions
        (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
      VALUES
        (gen_random_uuid(), ${schoolId}::uuid, ${courseId}::uuid,
         business_today(), business_today() + 30, 20, now())
    `;
  }

  async function createDelivery(
    schoolId: string,
    courseId: string,
    classSectionId: string,
    academicYear: string,
  ): Promise<string> {
    const delivery = await prisma.delivery.create({
      data: { schoolId, courseId, classSectionId, academicYear },
      select: { id: true },
    });
    createdDeliveryIds.push(delivery.id);
    return delivery.id;
  }

  async function enroll(
    deliveryId: string,
    studentId: string,
    schoolId: string,
    status: EnrollmentStatus = EnrollmentStatus.ACTIVE,
  ): Promise<void> {
    const enrollment = await prisma.deliveryEnrollment.create({
      data: {
        deliveryId,
        studentId,
        schoolId,
      },
      select: { id: true },
    });
    if (status !== EnrollmentStatus.ACTIVE) {
      await prisma.deliveryEnrollment.update({
        where: { id: enrollment.id },
        data: { status, endedAt: new Date() },
      });
    }
  }

  async function expireSubscription(schoolId: string, courseId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE subscriptions
      SET start_date = business_today() - 2,
          end_date = business_today() - 1
      WHERE school_id = ${schoolId}::uuid
        AND course_id = ${courseId}::uuid
    `;
  }

  function getCourses(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/learning/courses')
      .set('Cookie', cookie)
      .query(query);
  }

  function getOutline(cookie: string, deliveryId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/learning/deliveries/${deliveryId}/outline`)
      .set('Cookie', cookie);
  }

  function getLessonContent(cookie: string, deliveryId: string, lessonId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/learning/deliveries/${deliveryId}/lessons/${lessonId}/content`)
      .set('Cookie', cookie);
  }

  function getReleaseOutline(cookie: string, deliveryId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/releases`)
      .set('Cookie', cookie);
  }

  function assignTeacher(deliveryId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/teachers`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ teacherId: fixture.schoolA.teacher.id });
  }

  function removeTeacher(deliveryId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/teachers/${fixture.schoolA.teacher.id}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie);
  }

  function unreleaseLesson(deliveryId: string, lessonId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/releases/lessons/${lessonId}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie);
  }

  function allJsonKeys(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap(allJsonKeys);
    }
    if (value !== null && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, child]) => [key, ...allJsonKeys(child)]);
    }
    return [];
  }

  function expectNoHiddenContentFields(body: unknown): void {
    const hidden = new Set([
      'audience',
      'contentVersion',
      'createdAt',
      'error',
      'errorCode',
      'errorMessage',
      'file',
      'fileId',
      'fileIds',
      'fileStatus',
      'lastError',
      'originalFilename',
      'playbackKey',
      'position',
      'processing',
      'processingJobId',
      'processingStatus',
      'releasable',
      'release',
      'releaseInfo',
      'releaseState',
      'released',
      'releasedById',
      'releasedAt',
      'releasedOn',
      'size',
      'sizeBytes',
      'status',
      'storageKey',
      'updatedAt',
      'uploadId',
    ]);
    expect(allJsonKeys(body).filter((key) => hidden.has(key))).toEqual([]);
  }

  it('lists only active own enrollments with scoped counts and subscription state', async () => {
    const response = await getCourses(studentCookie).expect(200);
    expect(response.body.items.map((item: { academicYear: string }) => item.academicYear)).toEqual([
      '2026-27',
      '2027-28',
      '2026-27',
    ]);
    expect(
      response.body.items.map((item: { course: { title: string } }) => item.course.title),
    ).toEqual([
      expect.stringContaining('LRN-2 Alpha'),
      expect.stringContaining('LRN-2 Alpha'),
      expect.stringContaining('LRN-2 Beta'),
    ]);
    expect(response.body.total).toBe(3);
    expect(response.body.items[0]).toMatchObject({
      deliveryId: deliveries.firstYear,
      totalLessons: 3,
      completedLessons: 1,
      subscriptionActive: true,
    });
    expect(response.body.items[1]).toMatchObject({
      deliveryId: deliveries.secondYear,
      totalLessons: 3,
      completedLessons: 0,
      subscriptionActive: true,
    });
    expect(response.body.items[2]).toMatchObject({
      deliveryId: deliveries.expired,
      totalLessons: 1,
      completedLessons: 0,
      subscriptionActive: false,
    });
    expect(
      response.body.items.map((item: { deliveryId: string }) => item.deliveryId),
    ).not.toContain(deliveries.anotherStudent);
    expect(
      response.body.items.map((item: { deliveryId: string }) => item.deliveryId),
    ).not.toContain(deliveries.anotherClass);
    expect(
      response.body.items.map((item: { deliveryId: string }) => item.deliveryId),
    ).not.toContain(deliveries.completed);
    expect(
      response.body.items.map((item: { deliveryId: string }) => item.deliveryId),
    ).not.toContain(deliveries.removed);
    expect(
      response.body.items.map((item: { deliveryId: string }) => item.deliveryId),
    ).not.toContain(deliveries.inactive);
    for (const item of response.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'academicYear',
          'className',
          'completedLessons',
          'course',
          'deliveryId',
          'sectionName',
          'subscriptionActive',
          'totalLessons',
        ].sort(),
      );
      expect(Object.keys(item.course).sort()).toEqual(['description', 'id', 'title'].sort());
    }
  });

  it('paginates learning courses with the complete matching total', async () => {
    const first = await getCourses(studentCookie, { page: 1, limit: 1 }).expect(200);
    const second = await getCourses(studentCookie, { page: 2, limit: 1 }).expect(200);

    expect(first.body).toMatchObject({ page: 1, limit: 1, total: 3 });
    expect(second.body).toMatchObject({ page: 2, limit: 1, total: 3 });
    expect(first.body.items[0].deliveryId).toBe(deliveries.firstYear);
    expect(second.body.items[0].deliveryId).toBe(deliveries.secondYear);
  });

  it('returns 403 for teacher and platform staff, and 401 without authentication', async () => {
    await getCourses(teacherCookie).expect(403);
    await getCourses(adminCookie).expect(403);
    await getCourses('').expect(401);
  });

  it('returns an ordered released-student outline with completion flags and no hidden fields', async () => {
    const response = await getOutline(studentCookie, deliveries.firstYear).expect(200);

    expect(Object.keys(response.body).sort()).toEqual(['course', 'deliveryId', 'modules'].sort());
    expect(Object.keys(response.body.course).sort()).toEqual(['id', 'title'].sort());
    expect(response.body.deliveryId).toBe(deliveries.firstYear);
    expect(response.body.modules.map((module: { id: string }) => module.id)).toEqual([
      outlineModuleId,
      archivedModuleId,
    ]);
    expect(response.body.modules.map((module: { title: string }) => module.title)).toEqual([
      'Visible module',
      'Archived module',
    ]);
    expect(response.body.modules[0].lessons.map((lesson: { id: string }) => lesson.id)).toEqual([
      activeLessonId,
      archivedLessonId,
    ]);
    expect(
      response.body.modules[0].lessons.map((lesson: { completed: boolean }) => lesson.completed),
    ).toEqual([true, false]);
    expect(response.body.modules[1].lessons[0]).toMatchObject({
      id: archivedModuleLessonId,
      completed: false,
    });
    expect(response.body.modules[0].lessons.map((lesson: { id: string }) => lesson.id)).not.toEqual(
      expect.arrayContaining([teacherOnlyLessonId, unreleasedLessonId, draftLessonId]),
    );
    for (const module of response.body.modules) {
      expect(Object.keys(module).sort()).toEqual(['id', 'lessons', 'position', 'title'].sort());
      for (const lesson of module.lessons) {
        expect(Object.keys(lesson).sort()).toEqual(['completed', 'id', 'position', 'title'].sort());
      }
    }
  });

  it('returns an empty outline when the delivery has no released student lessons', async () => {
    const courseId = await createCourse('LRN-2 Empty Outline');
    await createSubscription(fixture.schoolA.school.id, courseId);
    const deliveryId = await createDelivery(
      fixture.schoolA.school.id,
      courseId,
      fixture.schoolA.section.id,
      '2026-27',
    );
    await enroll(deliveryId, fixture.schoolA.student.id, fixture.schoolA.school.id);
    await prisma.module.create({
      data: {
        courseId,
        title: 'No released lessons',
        position: 1,
        status: ContentStatus.ACTIVE,
        lessons: {
          create: {
            title: 'Unreleased lesson',
            position: 1,
            status: ContentStatus.ACTIVE,
            audience: LessonAudience.STUDENT,
          },
        },
      },
    });

    const response = await getOutline(studentCookie, deliveryId).expect(200);
    expect(response.body.modules).toEqual([]);
  });

  it('returns the minimal content tree and safe asset summaries to an enrolled student', async () => {
    const response = await getLessonContent(studentCookie, deliveries.firstYear, activeLessonId)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');

    expect(Object.keys(response.body).sort()).toEqual(
      ['assets', 'blocks', 'lessonId', 'title'].sort(),
    );
    expect(response.body).toMatchObject({
      lessonId: activeLessonId,
      title: 'Completed student lesson',
    });
    expect(response.body.blocks.map((block: { type: BlockType }) => block.type)).toEqual([
      BlockType.RICH_TEXT,
      BlockType.TWO_COLUMN,
      BlockType.ACCORDION,
      BlockType.IMAGE,
    ]);
    expect(response.body.blocks[0].content.doc.content[0].content[0].text).toBe('Lesson text');
    expect(
      response.body.blocks[1].columns.map(
        (block: { type: BlockType } | null) => block?.type ?? null,
      ),
    ).toEqual([BlockType.IMAGE, BlockType.RICH_TEXT]);
    expect(response.body.blocks[1].columns[0].assetId).toBe(readyAssetId);
    expect(response.body.blocks[2].content).toEqual({
      title: 'More details',
      body: {
        format: 'tiptap',
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lesson text' }] }],
        },
      },
    });
    expect(response.body.blocks[3].assetId).toBe(failedAssetId);
    expect(response.body.assets).toHaveLength(2);
    expect(response.body.assets.map((asset: { id: string }) => asset.id).sort()).toEqual(
      [readyAssetId, failedAssetId].sort(),
    );
    for (const asset of response.body.assets) {
      expect(Object.keys(asset).sort()).toEqual(['id', 'mimeType', 'title', 'type'].sort());
      expect(asset).toMatchObject({
        type: AssetType.IMAGE,
        mimeType: 'image/png',
      });
    }
    expectNoHiddenContentFields(response.body);

    const archived = await getLessonContent(studentCookie, deliveries.firstYear, archivedLessonId)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(archived.body.title).toBe('Archived student lesson');
    expect(archived.body.blocks).toHaveLength(1);
    expectNoHiddenContentFields(archived.body);
  });

  it('hides unreleased, teacher-only, draft, cross-delivery, cross-school, and unenrolled lessons', async () => {
    await getLessonContent(studentCookie, deliveries.firstYear, unreleasedLessonId).expect(404);
    await getLessonContent(studentCookie, deliveries.firstYear, teacherOnlyLessonId).expect(404);
    await getLessonContent(studentCookie, deliveries.firstYear, draftLessonId).expect(404);

    await enroll(deliveries.noRelease, fixture.schoolA.student.id, fixture.schoolA.school.id);
    await getLessonContent(studentCookie, deliveries.noRelease, activeLessonId).expect(404);
    await prisma.deliveryEnrollment.updateMany({
      where: { deliveryId: deliveries.noRelease, studentId: fixture.schoolA.student.id },
      data: { status: EnrollmentStatus.REMOVED, endedAt: new Date() },
    });

    await getLessonContent(studentCookie, deliveries.foreign, activeLessonId).expect(404);
    await getLessonContent(studentCookie, deliveries.removed, activeLessonId).expect(404);
    await getLessonContent(unenrolledCookie, deliveries.firstYear, activeLessonId).expect(404);
  });

  it('returns the subscription error only after the student lesson passes visibility checks', async () => {
    const response = await getLessonContent(
      studentCookie,
      deliveries.expired,
      expiredLessonId,
    ).expect(403);
    expect(response.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('lets assigned teachers read active student and teacher-only lessons without student release', async () => {
    const releaseOutline = await getReleaseOutline(teacherCookie, deliveries.firstYear).expect(200);
    const listedLessonIds = releaseOutline.body.modules.flatMap(
      (module: { lessons: Array<{ id: string }> }) => module.lessons.map(({ id }) => id),
    );
    expect(listedLessonIds).toContain(teacherOnlyLessonId);

    for (const lessonId of [activeLessonId, teacherOnlyLessonId]) {
      const response = await getLessonContent(teacherCookie, deliveries.firstYear, lessonId)
        .expect(200)
        .expect('Cache-Control', 'private, no-store');
      expect(response.body.lessonId).toBe(lessonId);
      expectNoHiddenContentFields(response.body);
    }
    await getLessonContent(teacherCookie, deliveries.firstYear, draftLessonId).expect(404);
    await getLessonContent(peerTeacherCookie, deliveries.firstYear, activeLessonId).expect(404);
    await getLessonContent(teacherCookie, deliveries.noRelease, activeLessonId).expect(404);

    await assignTeacher(deliveries.noRelease).expect(201);
    await getLessonContent(teacherCookie, deliveries.noRelease, activeLessonId).expect(200);
    await removeTeacher(deliveries.noRelease).expect(204);
    await getLessonContent(teacherCookie, deliveries.noRelease, activeLessonId).expect(404);
  });

  it('rejects platform staff and unauthenticated callers on the lesson content route', async () => {
    await getLessonContent(adminCookie, deliveries.firstYear, activeLessonId).expect(403);
    await getLessonContent('', deliveries.firstYear, activeLessonId).expect(401);
  });

  it('returns not found for foreign, another-class, and unenrolled deliveries', async () => {
    await getOutline(studentCookie, deliveries.foreign).expect(404);
    await getOutline(studentCookie, deliveries.anotherClass).expect(404);
    await getOutline(unenrolledCookie, deliveries.firstYear).expect(404);
  });

  it('returns 403 SUBSCRIPTION_EXPIRED after confirming the student can access the delivery', async () => {
    const response = await getOutline(studentCookie, deliveries.expired).expect(403);
    expect(response.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('rejects non-students and unauthenticated callers on the outline route', async () => {
    await getOutline(teacherCookie, deliveries.firstYear).expect(403);
    await getOutline(adminCookie, deliveries.firstYear).expect(403);
    await getOutline('', deliveries.firstYear).expect(401);
  });

  it('hides student content immediately after the lesson release is removed', async () => {
    await unreleaseLesson(deliveries.firstYear, activeLessonId).expect(204);
    await getLessonContent(studentCookie, deliveries.firstYear, activeLessonId).expect(404);
  });
});
