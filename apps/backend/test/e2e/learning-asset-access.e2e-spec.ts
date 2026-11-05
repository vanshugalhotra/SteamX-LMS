import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import type { Env } from '../../src/config/env.schema.js';
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
  EnrollmentStatus,
  LessonAudience,
  PrismaClient,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createTestStudent,
  createTestTeacher,
  createTwoSchoolFixture,
  TENANCY_TEST_PASSWORD,
  type TestUserFixture,
  type TwoSchoolFixture,
} from '../support/factories/fixtures.js';
import { createTestAsset, createTestAssetFile } from '../support/factories/assets.js';
import { createTestAssetWithReadyFile } from '../support/factories/curriculum.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { createTestApp, getTestStorageService } from '../support/create-test-app.js';
import { loginAsCookie } from '../support/login.js';

type TestAsset = { id: string };

describe('Learning asset access endpoint (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let teacherCookie: string;
  let unassignedTeacherCookie: string;
  let studentCookie: string;
  let unenrolledStudentCookie: string;
  let peerTeacherCookie: string;
  let studentName: string;
  let assetAccessTtls: Env['assetAccess'];
  let deliveryId: string;
  let removedEnrollmentDeliveryId: string;
  let foreignDeliveryId: string;
  let expiredDeliveryId: string;
  let activeLessonId: string;
  let otherLessonId: string;
  let unreleasedLessonId: string;
  let teacherOnlyLessonId: string;
  let foreignLessonId: string;
  let expiredLessonId: string;
  let customTeacher: TestUserFixture;
  let unenrolledStudent: TestUserFixture;
  let image: TestAsset;
  let pdf: TestAsset;
  let video: TestAsset;
  let archivedAsset: TestAsset;
  let nestedAsset: TestAsset;
  let otherLessonAsset: TestAsset;
  let noReadyAsset: TestAsset;
  let teacherOnlyAsset: TestAsset;
  let foreignAsset: TestAsset;
  let expiredAsset: TestAsset;
  let hiddenLessonAsset: TestAsset;
  const createdCourseIds: string[] = [];
  const createdDeliveryIds: string[] = [];
  const createdAssetIds: string[] = [];
  const createdUserIds: string[] = [];
  const moduleIds = new Map<string, string>();
  const lessonPositions = new Map<string, number>();

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Learning asset access e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    assetAccessTtls = config.get('assetAccess', { infer: true });
    if (!origin) {
      throw new Error('Learning asset access e2e tests require a configured CORS_ORIGINS entry.');
    }

    fixture = await createTwoSchoolFixture(prisma);
    studentName = (
      await prisma.user.findUniqueOrThrow({
        where: { id: fixture.schoolA.student.id },
        select: { name: true },
      })
    ).name;
    const passwordHash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);
    [customTeacher, unenrolledStudent] = await prisma.$transaction(async (tx) => [
      await createTestTeacher(
        tx,
        fixture.schoolA.school.id,
        passwordHash,
        'Learning access unassigned teacher',
      ),
      await createTestStudent(
        tx,
        fixture.schoolA.school.id,
        fixture.schoolA.section.id,
        passwordHash,
        'Learning access unenrolled student',
      ),
    ]);
    createdUserIds.push(customTeacher.id, unenrolledStudent.id);

    [
      adminCookie,
      teacherCookie,
      unassignedTeacherCookie,
      studentCookie,
      unenrolledStudentCookie,
      peerTeacherCookie,
    ] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, customTeacher),
      loginAsCookie(app, fixture.schoolA.student),
      loginAsCookie(app, unenrolledStudent),
      loginAsCookie(app, fixture.schoolB.teacher),
    ]);

    const schoolACourseId = await createCourse('Learning access A');
    const schoolBCourseId = await createCourse('Learning access B');
    const expiredCourseId = await createCourse('Learning access expired');
    await Promise.all([
      createSubscription(fixture.schoolA.school.id, schoolACourseId),
      createSubscription(fixture.schoolB.school.id, schoolBCourseId),
      createSubscription(fixture.schoolA.school.id, expiredCourseId),
    ]);

    deliveryId = await createDelivery(
      fixture.schoolA.school.id,
      schoolACourseId,
      fixture.schoolA.section.id,
      '2026-27',
    );
    removedEnrollmentDeliveryId = await createDelivery(
      fixture.schoolA.school.id,
      schoolACourseId,
      fixture.schoolA.section.id,
      '2027-28',
    );
    foreignDeliveryId = await createDelivery(
      fixture.schoolB.school.id,
      schoolBCourseId,
      fixture.schoolB.section.id,
      '2028-29',
    );
    expiredDeliveryId = await createDelivery(
      fixture.schoolA.school.id,
      expiredCourseId,
      fixture.schoolA.section.id,
      '2029-30',
    );

    await Promise.all([
      enroll(deliveryId, fixture.schoolA.student.id, fixture.schoolA.school.id),
      enroll(removedEnrollmentDeliveryId, fixture.schoolA.student.id, fixture.schoolA.school.id),
      enroll(foreignDeliveryId, fixture.schoolB.student.id, fixture.schoolB.school.id),
      enroll(expiredDeliveryId, fixture.schoolA.student.id, fixture.schoolA.school.id),
    ]);
    await prisma.deliveryEnrollment.updateMany({
      where: { deliveryId: removedEnrollmentDeliveryId, studentId: fixture.schoolA.student.id },
      data: { status: EnrollmentStatus.REMOVED, endedAt: new Date() },
    });

    activeLessonId = await createLesson(schoolACourseId, 'Active lesson');
    otherLessonId = await createLesson(schoolACourseId, 'Other active lesson');
    unreleasedLessonId = await createLesson(schoolACourseId, 'Unreleased lesson');
    teacherOnlyLessonId = await createLesson(
      schoolACourseId,
      'Teacher-only lesson',
      LessonAudience.TEACHER_ONLY,
    );
    foreignLessonId = await createLesson(schoolBCourseId, 'Foreign lesson');
    expiredLessonId = await createLesson(expiredCourseId, 'Expired lesson');

    await Promise.all([
      releaseLesson(deliveryId, activeLessonId, fixture.schoolA.school.id, schoolACourseId),
      releaseLesson(deliveryId, otherLessonId, fixture.schoolA.school.id, schoolACourseId),
      releaseLesson(
        removedEnrollmentDeliveryId,
        activeLessonId,
        fixture.schoolA.school.id,
        schoolACourseId,
      ),
      releaseLesson(foreignDeliveryId, foreignLessonId, fixture.schoolB.school.id, schoolBCourseId),
      releaseLesson(expiredDeliveryId, expiredLessonId, fixture.schoolA.school.id, expiredCourseId),
    ]);
    await expireSubscription(fixture.schoolA.school.id, expiredCourseId);

    image = await createReadyAsset(AssetType.IMAGE);
    pdf = await createReadyAsset(AssetType.PDF);
    video = await createReadyAsset(AssetType.VIDEO);
    archivedAsset = await createReadyAsset(AssetType.IMAGE, ContentStatus.ARCHIVED);
    nestedAsset = await createReadyAsset(AssetType.PDF);
    otherLessonAsset = await createReadyAsset(AssetType.IMAGE);
    noReadyAsset = await createUnreadyAsset(AssetType.IMAGE);
    teacherOnlyAsset = await createReadyAsset(AssetType.VIDEO);
    foreignAsset = await createReadyAsset(AssetType.PDF);
    expiredAsset = await createReadyAsset(AssetType.PDF);
    hiddenLessonAsset = await createReadyAsset(AssetType.IMAGE);

    await createBlock(activeLessonId, BlockType.IMAGE, image.id, 1);
    await createBlock(activeLessonId, BlockType.PDF, pdf.id, 2);
    await createBlock(activeLessonId, BlockType.VIDEO, video.id, 3);
    await createBlock(activeLessonId, BlockType.IMAGE, archivedAsset.id, 4);
    const columns = await createBlock(activeLessonId, BlockType.TWO_COLUMN, null, 5);
    await createBlock(activeLessonId, BlockType.PDF, nestedAsset.id, null, columns.id, 0);
    await createBlock(otherLessonId, BlockType.IMAGE, otherLessonAsset.id, 1);
    await createBlock(activeLessonId, BlockType.IMAGE, noReadyAsset.id, 6);
    await createBlock(unreleasedLessonId, BlockType.IMAGE, hiddenLessonAsset.id, 1);
    await createBlock(teacherOnlyLessonId, BlockType.VIDEO, teacherOnlyAsset.id, 1);
    await createBlock(foreignLessonId, BlockType.PDF, foreignAsset.id, 1);
    await createBlock(expiredLessonId, BlockType.PDF, expiredAsset.id, 1);

    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/teachers`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ teacherId: fixture.schoolA.teacher.id })
      .expect(201);
  });

  afterAll(async () => {
    if (prisma && createdDeliveryIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.lessonBlock.deleteMany({
          where: { lesson: { courseId: { in: createdCourseIds } } },
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
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function getAssetAccess(
    cookie: string | undefined,
    delivery: string,
    lesson: string,
    asset: string,
  ) {
    const call = request(app.getHttpServer()).get(
      `/api/v1/learning/deliveries/${delivery}/lessons/${lesson}/assets/${asset}/access`,
    );
    return cookie ? call.set('Cookie', cookie) : call;
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

  async function enroll(deliveryId: string, studentId: string, schoolId: string): Promise<void> {
    await prisma.deliveryEnrollment.create({ data: { deliveryId, studentId, schoolId } });
  }

  async function createLesson(
    courseId: string,
    title: string,
    audience: LessonAudience = LessonAudience.STUDENT,
  ): Promise<string> {
    let moduleId = moduleIds.get(courseId);
    if (!moduleId) {
      const module = await prisma.module.create({
        data: {
          courseId,
          title: `Learning access module ${randomUUID()}`,
          position: 1,
          status: ContentStatus.ACTIVE,
        },
        select: { id: true },
      });
      moduleId = module.id;
      moduleIds.set(courseId, moduleId);
    }
    const position = (lessonPositions.get(courseId) ?? 0) + 1;
    lessonPositions.set(courseId, position);
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        moduleId,
        title: `${title} ${randomUUID()}`,
        position,
        status: ContentStatus.ACTIVE,
        audience,
      },
      select: { id: true },
    });
    return lesson.id;
  }

  function releaseLesson(deliveryId: string, lessonId: string, schoolId: string, courseId: string) {
    return prisma.deliveryLessonRelease.create({
      data: { deliveryId, lessonId, schoolId, courseId },
    });
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

  async function createReadyAsset(
    type: AssetType,
    status: ContentStatus = ContentStatus.ACTIVE,
  ): Promise<TestAsset> {
    const asset = await createTestAssetWithReadyFile(prisma, type, {
      status,
      title: `Learning access asset ${randomUUID()}`,
      originalFilename: `learning-${type.toLowerCase()}`,
      sizeBytes: 1024,
    });
    createdAssetIds.push(asset.assetId);
    return { id: asset.assetId };
  }

  async function createUnreadyAsset(type: AssetType): Promise<TestAsset> {
    const id = await createTestAsset(prisma, {
      type,
      title: `Learning access unready asset ${randomUUID()}`,
    });
    await createTestAssetFile(prisma, id, AssetFileStatus.UPLOADING);
    createdAssetIds.push(id);
    return { id };
  }

  function createBlock(
    lessonId: string,
    type: BlockType,
    assetId: string | null,
    position: number | null,
    parentBlockId?: string,
    columnIndex?: number,
  ) {
    return prisma.lessonBlock.create({
      data: {
        lessonId,
        type,
        content: {},
        assetId,
        position,
        parentBlockId: parentBlockId ?? null,
        columnIndex: columnIndex ?? null,
      },
      select: { id: true },
    });
  }

  function expectNoHiddenAssetFields(value: unknown): void {
    const hiddenFields = new Set([
      'storageKey',
      'playbackKey',
      'fileId',
      'assetFileId',
      'bucket',
      'bucketName',
      'permanentUrl',
    ]);
    if (Array.isArray(value)) {
      for (const item of value) expectNoHiddenAssetFields(item);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        expect(hiddenFields.has(key)).toBe(false);
        expectNoHiddenAssetFields(nested);
      }
    }
  }

  it.each([
    ['PDF', 'pdf', 'pdfTtlSeconds'],
    ['image', 'image', 'imageTtlSeconds'],
    ['video', 'video', 'videoTtlSeconds'],
  ] as const)(
    'returns signed %s access and viewer watermark data',
    async (_label, assetKey, ttlKey) => {
      const asset = assetKey === 'pdf' ? pdf : assetKey === 'image' ? image : video;
      const ttlSeconds = assetAccessTtls[ttlKey];
      const before = Date.now();
      const response = await getAssetAccess(studentCookie, deliveryId, activeLessonId, asset.id)
        .expect(200)
        .expect('Cache-Control', 'private, no-store');

      const expiresAt = Date.parse(response.body.expiresAt);
      const issuedAt = Date.parse(response.body.viewer.issuedAt);
      expect(response.body).toMatchObject({
        url: expect.stringMatching(/^memory:\/\/download\/assets\//),
        type: assetKey.toUpperCase(),
        mimeType:
          assetKey === 'pdf' ? 'application/pdf' : assetKey === 'image' ? 'image/png' : 'video/mp4',
        viewer: {
          name: studentName,
          steamxId: fixture.schoolA.student.steamxId,
          schoolName: fixture.schoolA.school.name,
        },
      });
      expect(Object.keys(response.body).sort()).toEqual(
        ['url', 'expiresAt', 'type', 'mimeType', 'viewer'].sort(),
      );
      expect(Number.isNaN(expiresAt)).toBe(false);
      expect(Number.isNaN(issuedAt)).toBe(false);
      expect(issuedAt).toBeGreaterThanOrEqual(before);
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt).toBeGreaterThanOrEqual(before + ttlSeconds * 1_000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttlSeconds * 1_000);
      expect(getTestStorageService(app).downloadRequests.at(-1)).toMatchObject({
        expiresInSeconds: ttlSeconds,
        contentType:
          assetKey === 'pdf' ? 'application/pdf' : assetKey === 'image' ? 'image/png' : 'video/mp4',
      });
      expectNoHiddenAssetFields(response.body);
    },
  );

  it('serves nested two-column and archived assets', async () => {
    const nested = await getAssetAccess(
      studentCookie,
      deliveryId,
      activeLessonId,
      nestedAsset.id,
    ).expect(200);
    const archived = await getAssetAccess(
      studentCookie,
      deliveryId,
      activeLessonId,
      archivedAsset.id,
    ).expect(200);

    expect(nested.body.url).toMatch(/^memory:\/\/download\/assets\//);
    expect(archived.body.url).toMatch(/^memory:\/\/download\/assets\//);
    expectNoHiddenAssetFields(nested.body);
    expectNoHiddenAssetFields(archived.body);
  });

  it('requires a READY asset block in the requested lesson and hides foreign resources', async () => {
    await getAssetAccess(studentCookie, deliveryId, activeLessonId, otherLessonAsset.id).expect(
      404,
    );
    await getAssetAccess(studentCookie, deliveryId, activeLessonId, foreignAsset.id).expect(404);
    await getAssetAccess(studentCookie, deliveryId, activeLessonId, randomUUID()).expect(404);
    await getAssetAccess(studentCookie, deliveryId, activeLessonId, noReadyAsset.id).expect(404);
    await getAssetAccess(studentCookie, foreignDeliveryId, foreignLessonId, foreignAsset.id).expect(
      404,
    );
  });

  it('hides unreleased, teacher-only, unenrolled, and removed-student access', async () => {
    await getAssetAccess(
      studentCookie,
      deliveryId,
      unreleasedLessonId,
      hiddenLessonAsset.id,
    ).expect(404);
    await getAssetAccess(
      studentCookie,
      deliveryId,
      teacherOnlyLessonId,
      teacherOnlyAsset.id,
    ).expect(404);
    await getAssetAccess(unenrolledStudentCookie, deliveryId, activeLessonId, image.id).expect(404);
    await getAssetAccess(
      studentCookie,
      removedEnrollmentDeliveryId,
      activeLessonId,
      image.id,
    ).expect(404);
  });

  it('returns subscription expiry after lesson visibility succeeds', async () => {
    const response = await getAssetAccess(
      studentCookie,
      expiredDeliveryId,
      expiredLessonId,
      expiredAsset.id,
    ).expect(403);
    expect(response.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('allows assigned teachers including TEACHER_ONLY lessons, but not unassigned teachers', async () => {
    const studentLesson = await getAssetAccess(
      teacherCookie,
      deliveryId,
      activeLessonId,
      image.id,
    ).expect(200);
    const teacherOnly = await getAssetAccess(
      teacherCookie,
      deliveryId,
      teacherOnlyLessonId,
      teacherOnlyAsset.id,
    ).expect(200);

    expect(studentLesson.body.viewer.schoolName).toBe(fixture.schoolA.school.name);
    expect(teacherOnly.body.url).toMatch(/^memory:\/\/download\/assets\//);
    await getAssetAccess(unassignedTeacherCookie, deliveryId, activeLessonId, image.id).expect(404);
    await getAssetAccess(peerTeacherCookie, deliveryId, activeLessonId, image.id).expect(404);
    expectNoHiddenAssetFields(studentLesson.body);
    expectNoHiddenAssetFields(teacherOnly.body);
  });

  it('returns 403 for platform staff and 401 without authentication', async () => {
    await getAssetAccess(adminCookie, deliveryId, activeLessonId, image.id).expect(403);
    await getAssetAccess(undefined, deliveryId, activeLessonId, image.id).expect(401);
  });

  it('hides an asset on the next access request after its lesson is unreleased', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/releases/lessons/${activeLessonId}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(204);

    await getAssetAccess(studentCookie, deliveryId, activeLessonId, image.id).expect(404);
  });
});
