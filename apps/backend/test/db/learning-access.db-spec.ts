import { randomUUID } from 'node:crypto';
import {
  ContentStatus,
  DeliveryStatus,
  EnrollmentStatus,
  LessonAudience,
  UserType,
} from '../../src/generated/prisma/client.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { AuthContext } from '../../src/auth/types/auth-context.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { LearningAccessService } from '../../src/learning/learning-access.service.js';
import {
  createTestClassSection,
  createTestSchool,
  createTestStudent,
  createTestTeacher,
} from '../support/factories/fixtures.js';

type SchoolFixture = {
  schoolId: string;
  sectionId: string;
  studentId: string;
  teacherId: string;
  deliveryId: string;
  enrollmentId: string;
  assignmentId: string;
};

describe('Learning access service (database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let learningAccess: LearningAccessService;
  let schoolA: SchoolFixture;
  let schoolB: SchoolFixture;
  let courseId: string;
  let moduleId: string;
  let releasedLessonId: string;
  let teacherOnlyLessonId: string;
  let unreleasedLessonId: string;
  let draftLessonId: string;
  let additionalStudentId: string;
  let additionalTeacherId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    learningAccess = app.get(LearningAccessService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const [course] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO courses (id, title, status, updated_at)
      VALUES (gen_random_uuid(), 'Learning access test course', 'ACTIVE', now())
      RETURNING id::text AS id
    `;
    if (!course) {
      throw new Error('Failed to create a learning access test course.');
    }
    courseId = course.id;

    const [schoolARecord, schoolBRecord] = await prisma.$transaction(async (tx) => {
      const schoolA = await createTestSchool(tx, 'Learning access school A');
      const schoolB = await createTestSchool(tx, 'Learning access school B');
      return Promise.all([
        createSchoolFixture(tx, schoolA.id, courseId, 'A'),
        createSchoolFixture(tx, schoolB.id, courseId, 'B'),
      ]);
    });
    schoolA = schoolARecord;
    schoolB = schoolBRecord;

    const moduleRecord = await prisma.module.create({
      data: {
        courseId,
        title: 'Learning access module',
        position: 1,
        status: ContentStatus.ACTIVE,
      },
      select: { id: true },
    });
    moduleId = moduleRecord.id;
    const [releasedLesson, teacherOnlyLesson, unreleasedLesson, draftLesson] = await Promise.all([
      prisma.lesson.create({
        data: {
          moduleId,
          courseId,
          title: 'Released student lesson',
          position: 1,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.STUDENT,
        },
        select: { id: true },
      }),
      prisma.lesson.create({
        data: {
          moduleId,
          courseId,
          title: 'Teacher-only lesson',
          position: 2,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.TEACHER_ONLY,
        },
        select: { id: true },
      }),
      prisma.lesson.create({
        data: {
          moduleId,
          courseId,
          title: 'Unreleased lesson',
          position: 3,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.STUDENT,
        },
        select: { id: true },
      }),
      prisma.lesson.create({
        data: {
          moduleId,
          courseId,
          title: 'Draft lesson',
          position: 4,
          status: ContentStatus.DRAFT,
          audience: LessonAudience.STUDENT,
        },
        select: { id: true },
      }),
    ] as const);
    releasedLessonId = releasedLesson.id;
    teacherOnlyLessonId = teacherOnlyLesson.id;
    unreleasedLessonId = unreleasedLesson.id;
    draftLessonId = draftLesson.id;
    await prisma.deliveryLessonRelease.create({
      data: {
        deliveryId: schoolA.deliveryId,
        lessonId: releasedLessonId,
        schoolId: schoolA.schoolId,
        courseId,
      },
    });

    const { extraStudent, extraTeacher } = await prisma.$transaction(async (tx) => {
      const extraStudent = await createTestStudent(
        tx,
        schoolA.schoolId,
        schoolA.sectionId,
        'test-hash',
        'Unenrolled learning student',
      );
      const extraTeacher = await createTestTeacher(
        tx,
        schoolA.schoolId,
        'test-hash',
        'Unassigned learning teacher',
      );
      return { extraStudent, extraTeacher };
    });
    additionalStudentId = extraStudent.id;
    additionalTeacherId = extraTeacher.id;
  });

  afterEach(async () => {
    const deliveryIds = [schoolA.deliveryId, schoolB.deliveryId];
    await prisma.deliveryLessonRelease.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.deliveryEnrollment.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.deliveryTeacher.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await prisma.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.subscription.deleteMany({
      where: { schoolId: { in: [schoolA.schoolId, schoolB.schoolId] } },
    });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.module.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
  });

  it('allows an enrolled student and an assigned teacher to read an active delivery', async () => {
    const student = await learningAccess.assertDeliveryAccess(
      actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
      schoolA.deliveryId,
    );
    const teacher = await learningAccess.assertDeliveryAccess(
      actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
      schoolA.deliveryId,
    );

    expect(student).toMatchObject({
      role: 'STUDENT',
      schoolId: schoolA.schoolId,
      deliveryId: schoolA.deliveryId,
      courseId,
      studentId: schoolA.studentId,
    });
    expect(teacher).toMatchObject({
      role: 'TEACHER',
      schoolId: schoolA.schoolId,
      deliveryId: schoolA.deliveryId,
      courseId,
    });
    expect(teacher.studentId).toBeUndefined();
  });

  it('allows teachers to read active and archived lessons regardless of audience or release', async () => {
    const result = await learningAccess.assertLessonAccess(
      actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
      schoolA.deliveryId,
      teacherOnlyLessonId,
    );

    expect(result.lesson).toMatchObject({
      id: teacherOnlyLessonId,
      moduleId,
      status: ContentStatus.ACTIVE,
      audience: LessonAudience.TEACHER_ONLY,
    });

    await prisma.lesson.update({
      where: { id: teacherOnlyLessonId },
      data: { status: ContentStatus.ARCHIVED },
    });
    const archivedResult = await learningAccess.assertLessonAccess(
      actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
      schoolA.deliveryId,
      teacherOnlyLessonId,
    );
    expect(archivedResult.lesson).toMatchObject({
      id: teacherOnlyLessonId,
      status: ContentStatus.ARCHIVED,
      audience: LessonAudience.TEACHER_ONLY,
    });
  });

  it('hides teacher-only, unreleased, and draft lessons from students', async () => {
    const student = actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId);
    for (const lessonId of [teacherOnlyLessonId, unreleasedLessonId, draftLessonId]) {
      await expect(
        learningAccess.assertLessonAccess(student, schoolA.deliveryId, lessonId),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('hides draft lessons from teachers', async () => {
    await expect(
      learningAccess.assertLessonAccess(
        actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
        schoolA.deliveryId,
        draftLessonId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows students to read an archived lesson that remains released', async () => {
    await prisma.lesson.update({
      where: { id: releasedLessonId },
      data: { status: ContentStatus.ARCHIVED },
    });

    const result = await learningAccess.assertLessonAccess(
      actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
      schoolA.deliveryId,
      releasedLessonId,
    );

    expect(result.lesson).toMatchObject({
      id: releasedLessonId,
      status: ContentStatus.ARCHIVED,
      audience: LessonAudience.STUDENT,
    });
  });

  it('hides removed and missing student enrollments', async () => {
    await prisma.deliveryEnrollment.update({
      where: { id: schoolA.enrollmentId },
      data: { status: EnrollmentStatus.REMOVED, endedAt: new Date() },
    });
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, additionalStudentId),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides unassigned and ended teacher assignments', async () => {
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.SCHOOL_STAFF, schoolA.schoolId, additionalTeacherId),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await prisma.deliveryTeacher.update({
      where: { id: schoolA.assignmentId },
      data: { removedAt: new Date() },
    });
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides inactive deliveries from both roles', async () => {
    await prisma.delivery.update({
      where: { id: schoolA.deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides another school delivery from both roles', async () => {
    const studentFailure = await expectNotFound(() =>
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
        schoolB.deliveryId,
      ),
    );
    const teacherFailure = await expectNotFound(() =>
      learningAccess.assertDeliveryAccess(
        actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
        schoolB.deliveryId,
      ),
    );
    expect(teacherFailure.getResponse()).toEqual(studentFailure.getResponse());
    const unknownFailure = await expectNotFound(() =>
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
        randomUUID(),
      ),
    );
    expect(unknownFailure.getResponse()).toEqual(studentFailure.getResponse());
  });

  it('checks subscription last and hides foreign expired subscriptions', async () => {
    await expireSubscription(prisma, schoolA.schoolId);
    await expectSubscriptionExpired(() =>
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
        schoolA.deliveryId,
      ),
    );
    await expectSubscriptionExpired(() =>
      learningAccess.assertDeliveryAccess(
        actor(UserType.SCHOOL_STAFF, schoolA.schoolId, schoolA.teacherId),
        schoolA.deliveryId,
      ),
    );

    await expireSubscription(prisma, schoolB.schoolId);
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.STUDENT, schoolA.schoolId, schoolA.studentId),
        schoolB.deliveryId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects platform staff as a safety net', async () => {
    await expect(
      learningAccess.assertDeliveryAccess(
        actor(UserType.PLATFORM_STAFF, null, '00000000-0000-4000-8000-000000000001'),
        schoolA.deliveryId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

async function createSchoolFixture(
  tx: Prisma.TransactionClient,
  schoolId: string,
  courseId: string,
  label: string,
): Promise<SchoolFixture> {
  const section = await createTestClassSection(tx, schoolId, `Learning ${label}`);
  const teacher = await createTestTeacher(tx, schoolId, 'test-hash', `Learning teacher ${label}`);
  const student = await createTestStudent(
    tx,
    schoolId,
    section.id,
    'test-hash',
    `Learning student ${label}`,
  );
  await tx.$executeRaw`
    INSERT INTO subscriptions
      (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
    VALUES
      (gen_random_uuid(), ${schoolId}::uuid, ${courseId}::uuid,
       business_today(), business_today(), 2, now())
  `;
  const delivery = await tx.delivery.create({
    data: {
      schoolId,
      courseId,
      label: 'Learning access',
      academicYear: '2026-27',
    },
    select: { id: true },
  });
  const enrollment = await tx.deliveryEnrollment.create({
    data: { schoolId, deliveryId: delivery.id, studentId: student.id },
    select: { id: true },
  });
  const assignment = await tx.deliveryTeacher.create({
    data: { schoolId, deliveryId: delivery.id, teacherId: teacher.id },
    select: { id: true },
  });

  return {
    schoolId,
    sectionId: section.id,
    studentId: student.id,
    teacherId: teacher.id,
    deliveryId: delivery.id,
    enrollmentId: enrollment.id,
    assignmentId: assignment.id,
  };
}

function actor(userType: UserType, schoolId: string | null, userId: string): AuthContext {
  return {
    userId,
    steamxId: 'LEARNINGTEST',
    name: 'Learning access test actor',
    roleKey: userType === UserType.STUDENT ? 'student' : 'teacher',
    userType,
    schoolId,
    mustChangePassword: false,
  };
}

async function expireSubscription(prisma: PrismaService, schoolId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE subscriptions
    SET start_date = business_today() - 2,
        end_date = business_today() - 1
    WHERE school_id = ${schoolId}::uuid
  `;
}

async function expectNotFound(operation: () => Promise<unknown>): Promise<NotFoundException> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundException);
    if (error instanceof NotFoundException) {
      return error;
    }
  }
  throw new Error('Expected the learning access check to return not found.');
}

async function expectSubscriptionExpired(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    if (error instanceof ForbiddenException) {
      expect(error.getStatus()).toBe(403);
      expect(error.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_EXPIRED' });
      return;
    }
  }
  throw new Error('Expected the subscription access check to fail.');
}
