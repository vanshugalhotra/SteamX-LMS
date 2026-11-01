import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import type { Env } from '../../src/config/env.schema.js';
import {
  ContentStatus,
  DeliveryStatus,
  EnrollmentStatus,
  PrismaClient,
  UserStatus,
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
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';
import { loginAsCookie } from '../support/login.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';

describe('Delivery enrollment endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let peerTeacher: TestUserFixture;
  let origin: string;
  let adminCookie: string;
  let teacherCookie: string;
  let peerTeacherCookie: string;
  let otherSchoolTeacherCookie: string;
  let studentCookie: string;
  let subscriptionId: string;
  let courseId: string;
  let passwordHash: string;
  let deliverySequence = 0;
  const createdUserIds: string[] = [];
  const createdClassSectionIds: string[] = [];
  let revokeTeacherPermission: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Delivery enrollment e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    revokeTeacherPermission = (
      await grantPermissions(setupClient, 'teacher', [PERMISSION.ENROLLMENT_MANAGE])
    ).revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Delivery enrollment e2e tests require a configured CORS_ORIGINS entry.');
    }

    fixture = await createTwoSchoolFixture(prisma);
    passwordHash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);
    peerTeacher = await prisma.$transaction((tx) =>
      createTestTeacher(
        tx,
        fixture.schoolA.school.id,
        passwordHash,
        'Unassigned Enrollment Teacher',
      ),
    );
    const course = await prisma.course.create({
      data: { title: `Enrollment e2e ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    courseId = course.id;
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

    [adminCookie, teacherCookie, peerTeacherCookie, otherSchoolTeacherCookie, studentCookie] =
      await Promise.all([
        loginAsCookie(app, fixture.admin),
        loginAsCookie(app, fixture.schoolA.teacher),
        loginAsCookie(app, peerTeacher),
        loginAsCookie(app, fixture.schoolB.teacher),
        loginAsCookie(app, fixture.schoolA.student),
      ]);
  });

  afterAll(async () => {
    if (fixture) {
      const schoolIds = [fixture.schoolA.school.id, fixture.schoolB.school.id];
      await prisma.$transaction(async (tx) => {
        await tx.deliveryEnrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.deliveryTeacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.delivery.deleteMany({ where: { schoolId: { in: schoolIds } } });
        if (subscriptionId) {
          await tx.subscription.deleteMany({ where: { schoolId: { in: schoolIds }, courseId } });
        }
        if (courseId) {
          await tx.course.deleteMany({ where: { id: courseId } });
        }
      });
      await cleanupFixtures(
        prisma,
        [
          fixture.admin.id,
          fixture.schoolA.teacher.id,
          fixture.schoolA.student.id,
          fixture.schoolB.teacher.id,
          fixture.schoolB.student.id,
          peerTeacher.id,
          ...createdUserIds,
        ],
        schoolIds,
        [fixture.schoolA.section.id, fixture.schoolB.section.id, ...createdClassSectionIds],
      );
    }
    await app?.close();
    await revokeTeacherPermission?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function createStudent(
    classSectionId = fixture.schoolA.section.id,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<TestUserFixture> {
    const student = await prisma.$transaction((tx) =>
      createTestStudent(
        tx,
        fixture.schoolA.school.id,
        classSectionId,
        passwordHash,
        `Enrollment Student ${randomUUID().slice(0, 8)}`,
      ),
    );
    if (status !== UserStatus.ACTIVE) {
      await prisma.user.update({ where: { id: student.id }, data: { status } });
    }
    createdUserIds.push(student.id);
    return student;
  }

  async function createSection(): Promise<string> {
    const section = await prisma.classSection.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        className: `Enrollment class ${randomUUID().slice(0, 8)}`,
      },
      select: { id: true },
    });
    createdClassSectionIds.push(section.id);
    return section.id;
  }

  async function createDelivery(
    classSectionId = fixture.schoolA.section.id,
    status: DeliveryStatus = DeliveryStatus.ACTIVE,
  ): Promise<string> {
    deliverySequence += 1;
    const year = 2500 + deliverySequence;
    const delivery = await prisma.delivery.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        classSectionId,
        academicYear: `${year}-${String(deliverySequence % 100).padStart(2, '0')}`,
        status,
      },
      select: { id: true },
    });
    return delivery.id;
  }

  function enroll(cookie: string, deliveryId: string, studentIds: string[]) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/enrollments`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ studentIds });
  }

  function enrollClass(cookie: string, deliveryId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/enrollments/class`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function listEnrollments(
    cookie: string,
    deliveryId: string,
    query: Record<string, string | number> = {},
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/enrollments`)
      .set('Cookie', cookie)
      .query(query);
  }

  function removeEnrollment(cookie: string, deliveryId: string, studentId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/enrollments/${studentId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function assignTeacher(deliveryId: string, teacherId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/teachers`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ teacherId });
  }

  function removeTeacher(deliveryId: string, teacherId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/teachers/${teacherId}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie);
  }

  function patchUser(userId: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(body);
  }

  it('validates every requested student before enrolling any and returns the enrollment list', async () => {
    const deliveryId = await createDelivery();
    const validStudent = await createStudent();
    const wrongClassStudent = await createStudent(await createSection());
    const inactiveStudent = await createStudent(fixture.schoolA.section.id, UserStatus.INACTIVE);

    const wrongClass = await enroll(adminCookie, deliveryId, [
      validStudent.id,
      wrongClassStudent.id,
    ]);
    expectError(wrongClass, 409, 'STUDENT_WRONG_CLASS');
    expect(wrongClass.body.details.studentIds).toEqual([wrongClassStudent.id]);
    expect(await prisma.deliveryEnrollment.count({ where: { deliveryId } })).toBe(0);

    const inactive = await enroll(adminCookie, deliveryId, [validStudent.id, inactiveStudent.id]);
    expectError(inactive, 409, 'STUDENT_NOT_ACTIVE');
    expect(inactive.body.details.studentIds).toEqual([inactiveStudent.id]);
    expect(await prisma.deliveryEnrollment.count({ where: { deliveryId } })).toBe(0);

    expectError(await enroll(adminCookie, deliveryId, []), 400, 'VALIDATION_ERROR');
    expectError(await enroll(adminCookie, deliveryId, ['not-a-uuid']), 400, 'VALIDATION_ERROR');
    expectError(
      await enroll(
        adminCookie,
        deliveryId,
        Array.from({ length: 201 }, () => randomUUID()),
      ),
      400,
      'VALIDATION_ERROR',
    );

    for (const missingId of [fixture.schoolB.student.id, randomUUID()]) {
      const notFound = await enroll(adminCookie, deliveryId, [validStudent.id, missingId]);
      expectError(notFound, 404, 'STUDENT_NOT_FOUND');
      expect(notFound.body.details.studentIds).toEqual([missingId]);
      expect(await prisma.deliveryEnrollment.count({ where: { deliveryId } })).toBe(0);
    }

    const enrolled = await enroll(adminCookie, deliveryId, [
      validStudent.id,
      validStudent.id,
    ]).expect(200);
    expect(enrolled.body).toEqual({ enrolled: 1, reactivated: 0, alreadyEnrolled: 0 });
    const list = await listEnrollments(adminCookie, deliveryId).expect(200);
    expect(list.body).toMatchObject({
      total: 1,
      items: [
        {
          studentId: validStudent.id,
          name: expect.any(String),
          steamxId: validStudent.steamxId,
          classSection: {
            id: fixture.schoolA.section.id,
            className: expect.any(String),
            sectionName: 'All',
          },
          status: EnrollmentStatus.ACTIVE,
          enrolledBy: { id: fixture.admin.id, name: 'Tenancy Test Admin' },
          endedAt: null,
          endedBy: null,
        },
      ],
    });
    expect(list.body.items[0].id).toBeTruthy();
  });

  it('is idempotent, removes safely, and reactivates the same enrollment row', async () => {
    const deliveryId = await createDelivery();
    const student = await createStudent();
    const first = await enroll(adminCookie, deliveryId, [student.id]).expect(200);
    const original = await prisma.deliveryEnrollment.findFirstOrThrow({
      where: { deliveryId, studentId: student.id },
    });
    expect(first.body).toEqual({ enrolled: 1, reactivated: 0, alreadyEnrolled: 0 });

    const repeat = await enroll(adminCookie, deliveryId, [student.id]).expect(200);
    expect(repeat.body).toEqual({ enrolled: 0, reactivated: 0, alreadyEnrolled: 1 });
    expect(await prisma.deliveryEnrollment.count({ where: { deliveryId } })).toBe(1);

    await removeEnrollment(adminCookie, deliveryId, student.id).expect(204);
    const allStatuses = await listEnrollments(adminCookie, deliveryId).expect(200);
    expect(allStatuses.body).toMatchObject({
      total: 1,
      items: [{ id: original.id, status: EnrollmentStatus.REMOVED }],
    });
    expectError(
      await listEnrollments(adminCookie, deliveryId, { status: 'ALL' }),
      400,
      'VALIDATION_ERROR',
    );
    expect(
      (await listEnrollments(adminCookie, deliveryId, { status: 'ACTIVE' }).expect(200)).body.total,
    ).toBe(0);
    const removed = await listEnrollments(adminCookie, deliveryId, { status: 'REMOVED' }).expect(
      200,
    );
    expect(removed.body).toMatchObject({
      total: 1,
      items: [
        { id: original.id, status: EnrollmentStatus.REMOVED, endedBy: { id: fixture.admin.id } },
      ],
    });
    const removedRecord = await prisma.deliveryEnrollment.findUniqueOrThrow({
      where: { id: original.id },
    });

    await removeEnrollment(adminCookie, deliveryId, student.id).expect(204);
    expectError(
      await removeEnrollment(adminCookie, deliveryId, randomUUID()),
      404,
      'ENROLLMENT_NOT_FOUND',
    );

    const reactivated = await enroll(adminCookie, deliveryId, [student.id]).expect(200);
    expect(reactivated.body).toEqual({ enrolled: 0, reactivated: 1, alreadyEnrolled: 0 });
    const finalRow = await prisma.deliveryEnrollment.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(finalRow.id).toBe(original.id);
    expect(finalRow.status).toBe(EnrollmentStatus.ACTIVE);
    expect(finalRow.enrolledAt.getTime()).toBeGreaterThanOrEqual(
      removedRecord.enrolledAt.getTime(),
    );
    expect(finalRow.endedAt).toBeNull();
    expect(finalRow.endedById).toBeNull();
    expect(finalRow.enrolledById).toBe(fixture.admin.id);
  });

  it('enrolls active students in the delivery class and silently skips inactive users', async () => {
    const sectionId = await createSection();
    const activeStudent = await createStudent(sectionId);
    await createStudent(sectionId, UserStatus.INACTIVE);
    const deliveryId = await createDelivery(sectionId);

    const first = await enrollClass(adminCookie, deliveryId).expect(200);
    expect(first.body).toEqual({ enrolled: 1, reactivated: 0, alreadyEnrolled: 0 });
    const second = await enrollClass(adminCookie, deliveryId).expect(200);
    expect(second.body).toEqual({ enrolled: 0, reactivated: 0, alreadyEnrolled: 1 });
    expect(
      await prisma.deliveryEnrollment.count({ where: { deliveryId, studentId: activeStudent.id } }),
    ).toBe(1);
    expect(await prisma.deliveryEnrollment.count({ where: { deliveryId } })).toBe(1);

    const emptyDelivery = await createDelivery(await createSection());
    await expect(enrollClass(adminCookie, emptyDelivery).expect(200)).resolves.toMatchObject({
      body: { enrolled: 0, reactivated: 0, alreadyEnrolled: 0 },
    });
  });

  it('completes old-class active enrollments on class change and reuses them when returning', async () => {
    const oldDeliveryId = await createDelivery();
    const removedDeliveryId = await createDelivery();
    const completedDeliveryId = await createDelivery();
    const nextSectionId = await createSection();
    const nextDeliveryId = await createDelivery(nextSectionId);
    const student = await createStudent();

    await enroll(adminCookie, oldDeliveryId, [student.id]).expect(200);
    await enroll(adminCookie, removedDeliveryId, [student.id]).expect(200);
    await removeEnrollment(adminCookie, removedDeliveryId, student.id).expect(204);
    await enroll(adminCookie, completedDeliveryId, [student.id]).expect(200);
    const completedBefore = await prisma.deliveryEnrollment.update({
      where: {
        deliveryId_studentId: { deliveryId: completedDeliveryId, studentId: student.id },
      },
      data: {
        status: EnrollmentStatus.COMPLETED,
        endedAt: new Date(),
        endedById: fixture.admin.id,
      },
    });

    await patchUser(student.id, { classSectionId: fixture.schoolA.section.id }).expect(200);
    const beforeNoOp = await prisma.deliveryEnrollment.findUniqueOrThrow({
      where: { deliveryId_studentId: { deliveryId: oldDeliveryId, studentId: student.id } },
    });
    expect(beforeNoOp.status).toBe(EnrollmentStatus.ACTIVE);

    const changed = await patchUser(student.id, { classSectionId: nextSectionId }).expect(200);
    expect(changed.body.profile.classSectionId).toBe(nextSectionId);
    const [completedOld, removed, unchangedCompleted] = await Promise.all([
      prisma.deliveryEnrollment.findUniqueOrThrow({
        where: { deliveryId_studentId: { deliveryId: oldDeliveryId, studentId: student.id } },
      }),
      prisma.deliveryEnrollment.findUniqueOrThrow({
        where: { deliveryId_studentId: { deliveryId: removedDeliveryId, studentId: student.id } },
      }),
      prisma.deliveryEnrollment.findUniqueOrThrow({
        where: { deliveryId_studentId: { deliveryId: completedDeliveryId, studentId: student.id } },
      }),
    ]);
    expect(completedOld).toMatchObject({
      status: EnrollmentStatus.COMPLETED,
      endedById: fixture.admin.id,
    });
    expect(completedOld.endedAt).toBeTruthy();
    expect(removed.status).toBe(EnrollmentStatus.REMOVED);
    expect(unchangedCompleted.status).toBe(EnrollmentStatus.COMPLETED);
    expect(unchangedCompleted.endedAt).toEqual(completedBefore.endedAt);
    expectError(
      await removeEnrollment(adminCookie, oldDeliveryId, student.id),
      409,
      'ENROLLMENT_NOT_ACTIVE',
    );
    expect(
      await prisma.deliveryEnrollment.count({
        where: { deliveryId: nextDeliveryId, studentId: student.id },
      }),
    ).toBe(0);

    await patchUser(student.id, { classSectionId: fixture.schoolA.section.id }).expect(200);
    const response = await enroll(adminCookie, oldDeliveryId, [student.id]).expect(200);
    expect(response.body).toEqual({ enrolled: 0, reactivated: 1, alreadyEnrolled: 0 });
    const reactivated = await prisma.deliveryEnrollment.findUniqueOrThrow({
      where: { id: completedOld.id },
    });
    expect(reactivated.status).toBe(EnrollmentStatus.ACTIVE);
    expect(reactivated.endedAt).toBeNull();
    expect(reactivated.endedById).toBeNull();
  });

  it('enforces active teacher stints on all routes and role authentication', async () => {
    const deliveryId = await createDelivery();
    const assignedStudent = await createStudent();
    await assignTeacher(deliveryId, fixture.schoolA.teacher.id).expect(201);
    await enroll(teacherCookie, deliveryId, [assignedStudent.id]).expect(200);
    await listEnrollments(teacherCookie, deliveryId).expect(200);
    await removeEnrollment(teacherCookie, deliveryId, assignedStudent.id).expect(204);

    const unassignedCalls = [
      () => enroll(peerTeacherCookie, deliveryId, [assignedStudent.id]),
      () => enrollClass(peerTeacherCookie, deliveryId),
      () => listEnrollments(peerTeacherCookie, deliveryId),
      () => removeEnrollment(peerTeacherCookie, deliveryId, assignedStudent.id),
    ];
    for (const call of unassignedCalls) {
      expectError(await call(), 404, 'NOT_FOUND');
    }

    await removeTeacher(deliveryId, fixture.schoolA.teacher.id).expect(204);
    const removedTeacherCalls = [
      () => enroll(teacherCookie, deliveryId, [assignedStudent.id]),
      () => enrollClass(teacherCookie, deliveryId),
      () => listEnrollments(teacherCookie, deliveryId),
      () => removeEnrollment(teacherCookie, deliveryId, assignedStudent.id),
    ];
    for (const call of removedTeacherCalls) {
      expectError(await call(), 404, 'NOT_FOUND');
    }

    const foreignTeacherCalls = [
      () => enroll(otherSchoolTeacherCookie, deliveryId, [assignedStudent.id]),
      () => enrollClass(otherSchoolTeacherCookie, deliveryId),
      () => listEnrollments(otherSchoolTeacherCookie, deliveryId),
      () => removeEnrollment(otherSchoolTeacherCookie, deliveryId, assignedStudent.id),
    ];
    for (const call of foreignTeacherCalls) {
      expectError(await call(), 404, 'NOT_FOUND');
    }

    const studentCalls = [
      () => enroll(studentCookie, deliveryId, [assignedStudent.id]),
      () => enrollClass(studentCookie, deliveryId),
      () => listEnrollments(studentCookie, deliveryId),
      () => removeEnrollment(studentCookie, deliveryId, assignedStudent.id),
    ];
    for (const call of studentCalls) {
      expectError(await call(), 403, 'PERMISSION_REQUIRED');
    }

    const anonymousCalls = [
      () =>
        request(app.getHttpServer())
          .post(`/api/v1/deliveries/${deliveryId}/enrollments`)
          .set('Origin', origin)
          .send({ studentIds: [assignedStudent.id] }),
      () =>
        request(app.getHttpServer())
          .post(`/api/v1/deliveries/${deliveryId}/enrollments/class`)
          .set('Origin', origin),
      () => request(app.getHttpServer()).get(`/api/v1/deliveries/${deliveryId}/enrollments`),
      () =>
        request(app.getHttpServer())
          .delete(`/api/v1/deliveries/${deliveryId}/enrollments/${assignedStudent.id}`)
          .set('Origin', origin),
    ];
    for (const call of anonymousCalls) {
      expectError(await call(), 401, 'AUTHENTICATION_FAILED');
    }
  });

  it('gates enrollment writes by subscription for admins and teachers, but not reads or removal', async () => {
    const deliveryId = await createDelivery();
    const existingStudent = await createStudent();
    const newStudent = await createStudent();
    await createStudent();
    await assignTeacher(deliveryId, fixture.schoolA.teacher.id).expect(201);
    await enroll(adminCookie, deliveryId, [existingStudent.id]).expect(200);
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
      await enroll(adminCookie, deliveryId, [newStudent.id]),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    expectError(
      await enroll(teacherCookie, deliveryId, [newStudent.id]),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    expectError(await enrollClass(adminCookie, deliveryId), 403, 'SUBSCRIPTION_EXPIRED');
    expectError(await enrollClass(teacherCookie, deliveryId), 403, 'SUBSCRIPTION_EXPIRED');
    await listEnrollments(adminCookie, deliveryId).expect(200);
    await listEnrollments(teacherCookie, deliveryId).expect(200);
    await removeEnrollment(teacherCookie, deliveryId, existingStudent.id).expect(204);

    const renewed = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${subscriptionId}/renew`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ endDate: '2099-12-31' })
      .expect(201);
    expect(renewed.body.id).not.toBe(subscriptionId);
    await enroll(adminCookie, deliveryId, [newStudent.id]).expect(200);
    await enrollClass(adminCookie, deliveryId).expect(200);
  });

  it('rejects enrollment on an inactive delivery but permits removal', async () => {
    const deliveryId = await createDelivery();
    const student = await createStudent();
    await enroll(adminCookie, deliveryId, [student.id]).expect(200);
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    expectError(await enroll(adminCookie, deliveryId, [student.id]), 409, 'DELIVERY_NOT_ACTIVE');
    await removeEnrollment(adminCookie, deliveryId, student.id).expect(204);
  });

  it('serializes concurrent enrollment requests without creating duplicate rows', async () => {
    const deliveryId = await createDelivery();
    const student = await createStudent();
    const responses = await Promise.all([
      enroll(adminCookie, deliveryId, [student.id]),
      enroll(adminCookie, deliveryId, [student.id]),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      responses.reduce(
        (counts, response) => ({
          enrolled: counts.enrolled + response.body.enrolled,
          reactivated: counts.reactivated + response.body.reactivated,
          alreadyEnrolled: counts.alreadyEnrolled + response.body.alreadyEnrolled,
        }),
        { enrolled: 0, reactivated: 0, alreadyEnrolled: 0 },
      ),
    ).toEqual({ enrolled: 1, reactivated: 0, alreadyEnrolled: 1 });
    expect(
      await prisma.deliveryEnrollment.count({ where: { deliveryId, studentId: student.id } }),
    ).toBe(1);
  });
});
