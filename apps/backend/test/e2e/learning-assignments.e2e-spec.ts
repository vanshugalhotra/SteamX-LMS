/** Covers student assignment visibility, own-submission reads, and access ordering. */
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
  AssignmentStatus,
  ContentStatus,
  DeliveryStatus,
  EnrollmentStatus,
  LessonAudience,
  Prisma,
  PrismaClient,
  SubmissionStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createTestStudent,
  createTwoSchoolFixture,
  TENANCY_TEST_PASSWORD,
  type TestUserFixture,
  type TwoSchoolFixture,
} from '../support/factories/fixtures.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';
import { loginAsCookie } from '../support/login.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';

const futureDueDate = '2099-12-31T23:59:59.000Z';

describe('Student assignment reads (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let otherStudent: TestUserFixture;
  let unenrolledStudent: TestUserFixture;
  let origin: string;
  let studentCookie: string;
  let unenrolledCookie: string;
  let teacherCookie: string;
  let foreignTeacherCookie: string;
  let foreignStudentCookie: string;
  let adminCookie: string;
  let deliveryId: string;
  let otherDeliveryId: string;
  let courseId: string;
  let moduleId: string;
  let lessonId: string;
  let archivedLessonId: string;
  let unreleasedLessonId: string;
  let teacherOnlyLessonId: string;
  let subscriptionId: string;
  let foreignSubscriptionId: string;
  let foreignDeliveryId: string;
  let revokePermissions: (() => Promise<void>) | undefined;
  let ownEnrollmentId: string;
  const courseIds: string[] = [];
  const deliveryIds: string[] = [];
  const assignmentIds: string[] = [];
  const createdStudentIds: string[] = [];

  let moduleAssignmentId: string;
  let submittedAssignmentId: string;
  let gradedAssignmentId: string;
  let mcqAssignmentId: string;
  let lateAssignmentId: string;
  let lateNoSubmissionAssignmentId: string;
  let unpublishedAssignmentId: string;
  let draftAssignmentId: string;
  let unreleasedAssignmentId: string;
  let archivedAssignmentId: string;
  let teacherOnlyAssignmentId: string;
  let otherDeliveryAssignmentId: string;
  let courseAssignmentId: string;
  let foreignAssignmentId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Student assignment e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const [teacherPermissions, adminPermissions] = await Promise.all([
      grantPermissions(setupClient, 'teacher', [
        PERMISSION.ASSIGNMENT_MANAGE,
        PERMISSION.LEARNING_READ,
      ]),
      grantPermissions(setupClient, 'admin', [PERMISSION.LEARNING_READ]),
    ]);
    revokePermissions = async () => {
      await Promise.all([teacherPermissions.revoke(), adminPermissions.revoke()]);
    };

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    origin =
      app.get<ConfigService<Env, true>>(ConfigService).get('CORS_ORIGINS', { infer: true })[0] ??
      '';
    if (!origin) {
      throw new Error('Student assignment e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);

    const course = await prisma.course.create({
      data: { title: `Student assignment ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    courseId = course.id;
    courseIds.push(courseId);
    const subscription = await prisma.subscription.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        startDate: new Date('2000-01-01T00:00:00.000Z'),
        endDate: new Date('2099-12-31T00:00:00.000Z'),
        maxDeliveries: 100,
      },
      select: { id: true },
    });
    subscriptionId = subscription.id;
    deliveryId = await createDelivery(fixture.schoolA.school.id);
    otherDeliveryId = await createDelivery(fixture.schoolA.school.id);
    const foreignCourse = await prisma.course.create({
      data: { title: `Foreign student assignment ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    courseIds.push(foreignCourse.id);
    const foreignSubscription = await prisma.subscription.create({
      data: {
        schoolId: fixture.schoolB.school.id,
        courseId: foreignCourse.id,
        startDate: new Date('2000-01-01T00:00:00.000Z'),
        endDate: new Date('2099-12-31T00:00:00.000Z'),
        maxDeliveries: 100,
      },
      select: { id: true },
    });
    foreignSubscriptionId = foreignSubscription.id;
    const foreignDelivery = await prisma.delivery.create({
      data: {
        schoolId: fixture.schoolB.school.id,
        courseId: foreignCourse.id,
        label: `Foreign assignment delivery ${randomUUID()}`,
        academicYear: '2502-03',
        status: DeliveryStatus.ACTIVE,
      },
      select: { id: true },
    });
    foreignDeliveryId = foreignDelivery.id;
    deliveryIds.push(foreignDeliveryId);

    const module = await prisma.module.create({
      data: {
        courseId,
        title: `Student assignment module ${randomUUID()}`,
        position: 1,
        status: ContentStatus.ACTIVE,
      },
      select: { id: true },
    });
    moduleId = module.id;
    const lessons = await prisma.lesson.createManyAndReturn({
      data: [
        {
          courseId,
          moduleId,
          title: `Released lesson ${randomUUID()}`,
          position: 1,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.STUDENT,
        },
        {
          courseId,
          moduleId,
          title: `Archived lesson ${randomUUID()}`,
          position: 2,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.STUDENT,
        },
        {
          courseId,
          moduleId,
          title: `Unreleased lesson ${randomUUID()}`,
          position: 3,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.STUDENT,
        },
        {
          courseId,
          moduleId,
          title: `Teacher-only lesson ${randomUUID()}`,
          position: 4,
          status: ContentStatus.ACTIVE,
          audience: LessonAudience.STUDENT,
        },
      ],
      select: { id: true },
    });
    lessonId = lessons[0]!.id;
    archivedLessonId = lessons[1]!.id;
    unreleasedLessonId = lessons[2]!.id;
    teacherOnlyLessonId = lessons[3]!.id;
    await prisma.deliveryLessonRelease.createMany({
      data: [lessonId, archivedLessonId, teacherOnlyLessonId].map((releasedLessonId) => ({
        deliveryId,
        lessonId: releasedLessonId,
        schoolId: fixture.schoolA.school.id,
        courseId,
      })),
    });
    await prisma.deliveryTeacher.createMany({
      data: [deliveryId, otherDeliveryId].map((targetDeliveryId) => ({
        schoolId: fixture.schoolA.school.id,
        deliveryId: targetDeliveryId,
        teacherId: fixture.schoolA.teacher.id,
      })),
    });
    await prisma.deliveryTeacher.create({
      data: {
        schoolId: fixture.schoolB.school.id,
        deliveryId: foreignDeliveryId,
        teacherId: fixture.schoolB.teacher.id,
      },
    });

    const hash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);
    otherStudent = await prisma.$transaction((tx) =>
      createTestStudent(
        tx,
        fixture.schoolA.school.id,
        fixture.schoolA.section.id,
        hash,
        'Student assignment peer',
      ),
    );
    unenrolledStudent = await prisma.$transaction((tx) =>
      createTestStudent(
        tx,
        fixture.schoolA.school.id,
        fixture.schoolA.section.id,
        hash,
        'Unenrolled assignment student',
      ),
    );
    createdStudentIds.push(otherStudent.id, unenrolledStudent.id);

    const enrollment = await prisma.deliveryEnrollment.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId,
        studentId: fixture.schoolA.student.id,
        enrolledById: fixture.schoolA.teacher.id,
      },
      select: { id: true },
    });
    ownEnrollmentId = enrollment.id;
    await prisma.deliveryEnrollment.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId,
        studentId: otherStudent.id,
        enrolledById: fixture.schoolA.teacher.id,
      },
    });

    [
      studentCookie,
      unenrolledCookie,
      teacherCookie,
      foreignTeacherCookie,
      foreignStudentCookie,
      adminCookie,
    ] = await Promise.all([
      loginAsCookie(app, fixture.schoolA.student),
      loginAsCookie(app, unenrolledStudent),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, fixture.schoolB.teacher),
      loginAsCookie(app, fixture.schoolB.student),
      loginAsCookie(app, fixture.admin),
    ]);

    await prisma.lesson.update({
      where: { id: archivedLessonId },
      data: { status: ContentStatus.ARCHIVED },
    });
    moduleAssignmentId = await createPublishedAssignment({
      title: 'Module anchor assignment',
      moduleId,
      dueAt: '2099-12-28T00:00:00.000Z',
      blueprint: { items: [{ type: 'TEXT', prompt: 'Module response.' }], rubric: null },
    });
    courseAssignmentId = await createPublishedAssignment({
      title: 'Course-level assignment',
      dueAt: '2099-12-26T00:00:00.000Z',
      blueprint: { items: [{ type: 'TEXT', prompt: 'Course-wide response.' }], rubric: null },
    });
    submittedAssignmentId = await createPublishedAssignment({
      title: 'Submitted assignment',
      lessonId,
      dueAt: '2099-12-29T00:00:00.000Z',
      blueprint: { items: [{ type: 'TEXT', prompt: 'Answer one.' }], rubric: null },
    });
    gradedAssignmentId = await createPublishedAssignment({
      title: 'Graded assignment',
      lessonId,
      dueAt: '2099-12-30T00:00:00.000Z',
      blueprint: {
        allowResubmission: true,
        items: [
          { type: 'TEXT', prompt: 'First prompt.' },
          {
            type: 'FILE_UPLOAD',
            prompt: 'Upload your work.',
            config: { maxFiles: 2, maxSizeMb: 10, allowedTypes: ['PDF'] },
          },
        ],
        rubric: [
          { name: 'Knowledge', description: 'Shows subject knowledge.' },
          { name: 'Thinking', description: 'Explains reasoning.' },
          { name: 'Application', description: 'Applies concepts.' },
          { name: 'Communication', description: 'Communicates clearly.' },
        ],
      },
    });
    mcqAssignmentId = await createPublishedAssignment({
      title: 'Choice assignment',
      lessonId,
      dueAt: '2099-12-27T00:00:00.000Z',
      blueprint: {
        items: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Choose one.',
            options: [
              { text: 'First option', isCorrect: true },
              { text: 'Second option', isCorrect: false },
            ],
          },
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Choose another.',
            options: [
              { text: 'Third option', isCorrect: false },
              { text: 'Fourth option', isCorrect: true },
            ],
          },
        ],
        rubric: null,
      },
    });
    lateAssignmentId = await createPublishedAssignment({
      title: 'Late assignment',
      dueAt: '2000-01-01T00:00:00.000Z',
      blueprint: { items: [{ type: 'TEXT', prompt: 'Late response.' }], rubric: null },
    });
    lateNoSubmissionAssignmentId = await createPublishedAssignment({
      title: 'Late and not submitted',
      dueAt: '2000-01-01T00:00:00.000Z',
      blueprint: { items: [{ type: 'TEXT', prompt: 'No response yet.' }], rubric: null },
    });
    unpublishedAssignmentId = await createPublishedAssignment({
      title: 'Will be unpublished',
      dueAt: futureDueDate,
      blueprint: { items: [{ type: 'TEXT', prompt: 'Hidden later.' }], rubric: null },
    });
    draftAssignmentId = await createDraftAssignment();
    unreleasedAssignmentId = await createPublishedAssignment({
      title: 'Unreleased lesson assignment',
      lessonId: unreleasedLessonId,
      dueAt: futureDueDate,
      blueprint: { items: [{ type: 'TEXT', prompt: 'Hidden until released.' }], rubric: null },
    });
    archivedAssignmentId = await createPublishedAssignment({
      title: 'Archived lesson assignment',
      lessonId: archivedLessonId,
      dueAt: futureDueDate,
      blueprint: { items: [{ type: 'TEXT', prompt: 'Archived lesson.' }], rubric: null },
    });
    teacherOnlyAssignmentId = await createPublishedAssignment({
      title: 'Teacher-only lesson assignment',
      lessonId: teacherOnlyLessonId,
      dueAt: futureDueDate,
      blueprint: {
        items: [{ type: 'TEXT', prompt: 'Hidden after audience change.' }],
        rubric: null,
      },
    });
    await prisma.lesson.update({
      where: { id: teacherOnlyLessonId },
      data: { audience: LessonAudience.TEACHER_ONLY },
    });
    otherDeliveryAssignmentId = await createPublishedAssignment(
      {
        title: 'Other delivery assignment',
        dueAt: futureDueDate,
        blueprint: { items: [{ type: 'TEXT', prompt: 'Other delivery.' }], rubric: null },
      },
      otherDeliveryId,
    );
    foreignAssignmentId = await createPublishedAssignment(
      {
        title: 'Foreign school assignment',
        dueAt: futureDueDate,
        blueprint: { items: [{ type: 'TEXT', prompt: 'Foreign assignment.' }], rubric: null },
      },
      foreignDeliveryId,
      foreignTeacherCookie,
    );

    await createSubmission(submittedAssignmentId, fixture.schoolA.student.id);
    await createSubmission(gradedAssignmentId, fixture.schoolA.student.id, {
      graded: true,
      answers: [{ itemIndex: 0, answerText: 'My explanation.' }],
      fileItemIndex: 1,
    });
    await createSubmission(mcqAssignmentId, fixture.schoolA.student.id, {
      answers: [{ itemIndex: 0, selectedOptionIndex: 0 }],
    });
    await createSubmission(lateAssignmentId, fixture.schoolA.student.id);
    await createSubmission(unpublishedAssignmentId, fixture.schoolA.student.id);
    await createSubmission(moduleAssignmentId, otherStudent.id);
  });

  afterAll(async () => {
    if (prisma && deliveryIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        const allAssignmentIds = assignmentIds;
        await tx.submissionAnswer.deleteMany({
          where: { submission: { assignmentId: { in: allAssignmentIds } } },
        });
        await tx.submissionFile.deleteMany({
          where: { submission: { assignmentId: { in: allAssignmentIds } } },
        });
        await tx.submission.deleteMany({ where: { assignmentId: { in: allAssignmentIds } } });
        await tx.assignment.updateMany({
          where: { id: { in: allAssignmentIds }, status: AssignmentStatus.PUBLISHED },
          data: { status: AssignmentStatus.UNPUBLISHED },
        });
        await tx.assignmentItemOption.deleteMany({
          where: { item: { is: { assignmentId: { in: allAssignmentIds } } } },
        });
        await tx.assignmentItem.deleteMany({ where: { assignmentId: { in: allAssignmentIds } } });
        await tx.assignment.deleteMany({ where: { id: { in: allAssignmentIds } } });
        await tx.deliveryLessonRelease.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
        await tx.deliveryEnrollment.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
        await tx.deliveryTeacher.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
        await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
        await tx.subscription.deleteMany({
          where: { id: { in: [subscriptionId, foreignSubscriptionId] } },
        });
        await tx.lesson.deleteMany({ where: { courseId: { in: courseIds } } });
        await tx.module.deleteMany({ where: { courseId: { in: courseIds } } });
        await tx.course.deleteMany({ where: { id: { in: courseIds } } });
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
          ...createdStudentIds,
        ],
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await revokePermissions?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function createDelivery(schoolId: string): Promise<string> {
    return prisma.delivery
      .create({
        data: {
          schoolId,
          courseId,
          label: `Student assignment ${randomUUID()}`,
          academicYear: `${2500 + deliveryIds.length}-01`,
          status: DeliveryStatus.ACTIVE,
        },
        select: { id: true },
      })
      .then(({ id }) => {
        deliveryIds.push(id);
        return id;
      });
  }

  async function createPublishedAssignment(
    body: Record<string, unknown>,
    targetDeliveryId = deliveryId,
    cookie = teacherCookie,
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${targetDeliveryId}/assignments`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body)
      .expect(201);
    assignmentIds.push(created.body.id);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${targetDeliveryId}/assignments/${created.body.id}/publish`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    expect(published.body.status).toBe(AssignmentStatus.PUBLISHED);
    return created.body.id as string;
  }

  async function createDraftAssignment(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/assignments`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .send({ title: 'Draft assignment' })
      .expect(201);
    assignmentIds.push(created.body.id);
    return created.body.id as string;
  }

  async function createSubmission(
    assignmentId: string,
    studentId: string,
    options: {
      graded?: boolean;
      answers?: {
        itemIndex: number;
        answerText?: string;
        selectedOptionIndex?: number;
      }[];
      fileItemIndex?: number;
    } = {},
  ): Promise<void> {
    const submission = await prisma.submission.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId,
        assignmentId,
        studentId,
      },
      select: { id: true },
    });
    const items = await prisma.assignmentItem.findMany({
      where: { assignmentId },
      orderBy: { position: 'asc' },
      select: { id: true, options: { orderBy: { position: 'asc' }, select: { id: true } } },
    });
    if (options.answers) {
      for (const answer of options.answers) {
        const item = items[answer.itemIndex]!;
        await prisma.submissionAnswer.create({
          data: {
            schoolId: fixture.schoolA.school.id,
            submissionId: submission.id,
            assignmentId,
            itemId: item.id,
            answerText: answer.answerText ?? null,
            selectedOptionId:
              answer.selectedOptionIndex === undefined
                ? null
                : item.options[answer.selectedOptionIndex]!.id,
          },
        });
      }
    }
    if (options.fileItemIndex !== undefined) {
      const fileItem = items[options.fileItemIndex]!;
      await prisma.submissionFile.create({
        data: {
          schoolId: fixture.schoolA.school.id,
          submissionId: submission.id,
          assignmentId,
          itemId: fileItem.id,
          storageKey: `submissions/${fixture.schoolA.school.id}/test/${randomUUID()}`,
          filename: 'student-work.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(2048),
        },
      });
    }
    if (options.graded) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: SubmissionStatus.GRADED,
          gradePercent: new Prisma.Decimal(91.25),
          rubricLevels: ['4', '4-', '3+', '4'],
          overallFeedback: 'Well reasoned and clearly presented.',
          gradedAt: new Date(),
          gradedById: fixture.schoolA.teacher.id,
        },
      });
    }
  }

  function getAssignments(
    query: Record<string, string | number> = {},
    cookie = studentCookie,
    targetDeliveryId = deliveryId,
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/learning/deliveries/${targetDeliveryId}/assignments`)
      .set('Cookie', cookie)
      .query(query);
  }

  function getAssignment(
    assignmentId: string,
    cookie = studentCookie,
    targetDeliveryId = deliveryId,
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/learning/deliveries/${targetDeliveryId}/assignments/${assignmentId}`)
      .set('Cookie', cookie);
  }

  function submitAssignment(
    assignmentId: string,
    answers: Array<{
      itemId: string;
      selectedOptionId?: string;
      answerText?: string;
    }>,
    cookie = studentCookie,
    targetDeliveryId = deliveryId,
  ) {
    return request(app.getHttpServer())
      .put(`/api/v1/learning/deliveries/${targetDeliveryId}/assignments/${assignmentId}/submission`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ answers });
  }

  function getAssignmentItems(assignmentId: string) {
    return prisma.assignmentItem.findMany({
      where: { assignmentId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        options: { orderBy: { position: 'asc' }, select: { id: true } },
      },
    });
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

  it('lists only own submission states with filters, grade mapping, ordering, and pagination', async () => {
    const response = await getAssignments().expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const byId = new Map(response.body.items.map((item: { id: string }) => [item.id, item]));
    expect(byId.get(moduleAssignmentId)).toMatchObject({
      submissionState: 'NOT_SUBMITTED',
      submittedAt: null,
      grade: null,
      canSubmit: true,
      isLate: false,
    });
    expect(byId.get(submittedAssignmentId)).toMatchObject({
      submissionState: 'SUBMITTED',
      grade: null,
      canSubmit: false,
      isLate: false,
    });
    expect(byId.get(gradedAssignmentId)).toMatchObject({
      submissionState: 'GRADED',
      grade: { percent: 91.25, level: '4', letter: 'A' },
      canSubmit: true,
      isLate: false,
    });
    expect(byId.get(lateAssignmentId)).toMatchObject({ isLate: true });
    expect(byId.get(lateNoSubmissionAssignmentId)).toMatchObject({
      submissionState: 'NOT_SUBMITTED',
      isLate: true,
    });
    expect(byId.has(unreleasedAssignmentId)).toBe(false);
    expect(byId.has(teacherOnlyAssignmentId)).toBe(false);
    expect(byId.has(draftAssignmentId)).toBe(false);
    expect(byId.has(unpublishedAssignmentId)).toBe(true);
    expect(byId.has(courseAssignmentId)).toBe(true);
    expect(byId.has(archivedAssignmentId)).toBe(true);
    const dueDates = response.body.items.map((item: { dueAt: string }) => item.dueAt) as string[];
    expect(dueDates).toEqual(dueDates.slice().sort((left, right) => left.localeCompare(right)));

    const states = await Promise.all([
      getAssignments({ state: 'NOT_SUBMITTED' }).expect(200),
      getAssignments({ state: 'SUBMITTED' }).expect(200),
      getAssignments({ state: 'GRADED' }).expect(200),
    ]);
    expect(states[0]!.body.items.map((item: { id: string }) => item.id)).toContain(
      moduleAssignmentId,
    );
    expect(states[1]!.body.items.map((item: { id: string }) => item.id)).toContain(
      submittedAssignmentId,
    );
    expect(states[2]!.body.items.map((item: { id: string }) => item.id)).toEqual([
      gradedAssignmentId,
    ]);
    expect(states[0]!.body.items.map((item: { id: string }) => item.id)).not.toContain(
      unpublishedAssignmentId,
    );

    const lessonFilter = await getAssignments({ lessonId }).expect(200);
    expect(
      lessonFilter.body.items.every((item: { lessonId: string }) => item.lessonId === lessonId),
    ).toBe(true);
    const moduleFilter = await getAssignments({ moduleId }).expect(200);
    expect(moduleFilter.body.items.map((item: { id: string }) => item.id)).toEqual([
      moduleAssignmentId,
    ]);
    const first = await getAssignments({ page: 1, limit: 1 }).expect(200);
    const second = await getAssignments({ page: 2, limit: 1 }).expect(200);
    expect(first.body).toMatchObject({ page: 1, limit: 1, total: response.body.total });
    expect(second.body.total).toBe(response.body.total);
    expect(first.body.items[0].dueAt <= second.body.items[0].dueAt).toBe(true);
  });

  it('returns ordered student-safe detail with only own answers, files, and grade details', async () => {
    const response = await getAssignment(gradedAssignmentId).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toMatchObject({
      id: gradedAssignmentId,
      title: 'Graded assignment',
      canSubmit: true,
      rubric: [
        { name: 'Knowledge', description: 'Shows subject knowledge.' },
        { name: 'Thinking', description: 'Explains reasoning.' },
        { name: 'Application', description: 'Applies concepts.' },
        { name: 'Communication', description: 'Communicates clearly.' },
      ],
      items: [
        { position: 1, type: 'TEXT', prompt: 'First prompt.' },
        { position: 2, type: 'FILE_UPLOAD', prompt: 'Upload your work.' },
      ],
      submission: {
        state: 'GRADED',
        answers: [{ answerText: 'My explanation.' }],
        files: [
          {
            filename: 'student-work.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          },
        ],
        grade: {
          percent: 91.25,
          level: '4',
          letter: 'A',
          rubricLevels: ['4', '4-', '3+', '4'],
          feedback: 'Well reasoned and clearly presented.',
        },
      },
    });
    expect(response.body.items.map((item: { position: number }) => item.position)).toEqual([1, 2]);
    expect(response.body.items[0].options).toEqual([]);
    expect(response.body.submission.files[0]).toHaveProperty('id');
    expect(response.body.submission.files[0]).toHaveProperty('itemId');
    expect(response.body.submission.grade.gradedAt).toBeTruthy();

    const mcq = await getAssignment(mcqAssignmentId).expect(200);
    expect(mcq.body.items.map((item: { position: number }) => item.position)).toEqual([1, 2]);
    expect(
      mcq.body.items[0].options.map((option: { position: number }) => option.position),
    ).toEqual([1, 2]);
    for (const option of mcq.body.items.flatMap((item: { options: unknown[] }) => item.options)) {
      expect(Object.keys(option).sort()).toEqual(['id', 'position', 'text']);
    }
    const hiddenKeys = [
      'isCorrect',
      'is_correct',
      'blueprint',
      'sourceTemplateId',
      'createdById',
      'gradedById',
      'schoolId',
      'storageKey',
      'status',
    ];
    for (const body of [mcq.body, (await getAssignments()).body]) {
      expect(allJsonKeys(body).filter((key) => hiddenKeys.includes(key))).toEqual([]);
    }
    const otherStudentRead = await getAssignment(moduleAssignmentId).expect(200);
    expect(otherStudentRead.body.submission).toBeNull();
    expect(otherStudentRead.body.canSubmit).toBe(true);
    expect((await getAssignment(submittedAssignmentId).expect(200)).body.canSubmit).toBe(false);
    expect((await getAssignment(lateAssignmentId).expect(200)).body).toMatchObject({
      submission: { isLate: true },
    });
    expect((await getAssignment(lateNoSubmissionAssignmentId).expect(200)).body.isLate).toBe(true);
  });

  it('submits TEXT answers and reports lateness from the database due-date snapshot', async () => {
    const regularId = await createPublishedAssignment({
      title: 'First text submit',
      dueAt: futureDueDate,
      blueprint: { items: [{ type: 'TEXT', prompt: 'Explain.' }], rubric: null },
    });
    const lateId = await createPublishedAssignment({
      title: 'Late text submit',
      dueAt: '2000-01-01T00:00:00.000Z',
      blueprint: { items: [{ type: 'TEXT', prompt: 'Explain.' }], rubric: null },
    });
    const [regularItem, lateItem] = await Promise.all([
      getAssignmentItems(regularId),
      getAssignmentItems(lateId),
    ]);

    const regular = await submitAssignment(regularId, [
      { itemId: regularItem[0]!.id, answerText: '  My response.  ' },
    ]).expect(200);
    expect(regular.headers['cache-control']).toBe('private, no-store');
    expect(regular.body).toMatchObject({
      state: 'SUBMITTED',
      isLate: false,
      answers: [{ itemId: regularItem[0]!.id, answerText: 'My response.', selectedOptionId: null }],
      files: [],
      grade: null,
    });
    expect(
      await prisma.submission.count({
        where: { assignmentId: regularId, studentId: fixture.schoolA.student.id },
      }),
    ).toBe(1);

    const late = await submitAssignment(lateId, [
      { itemId: lateItem[0]!.id, answerText: 'Past due.' },
    ]).expect(200);
    const stored = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId: lateId,
          studentId: fixture.schoolA.student.id,
        },
      },
      select: { dueAtAtSubmission: true },
    });
    expect(late.body.isLate).toBe(true);
    expect(stored.dueAtAtSubmission?.toISOString()).toBe(
      new Date('2000-01-01T00:00:00.000Z').toISOString(),
    );
  });

  it('auto-grades MCQ answers and rejects unanswered and foreign options', async () => {
    const assignmentId = await createPublishedAssignment({
      title: 'Three question auto grade',
      dueAt: futureDueDate,
      blueprint: {
        items: Array.from({ length: 3 }, (_, index) => ({
          type: 'SINGLE_CHOICE',
          prompt: `Question ${index + 1}`,
          options: [
            { text: 'Correct', isCorrect: true },
            { text: 'Incorrect', isCorrect: false },
          ],
        })),
        rubric: null,
      },
    });
    const items = await getAssignmentItems(assignmentId);
    expectError(await submitAssignment(assignmentId, []), 422, 'SUBMISSION_INVALID');
    const foreignOption = items[1]!.options[0]!.id;
    expectError(
      await submitAssignment(assignmentId, [
        { itemId: items[0]!.id, selectedOptionId: foreignOption },
        { itemId: items[1]!.id, selectedOptionId: items[1]!.options[0]!.id },
        { itemId: items[2]!.id, selectedOptionId: items[2]!.options[0]!.id },
      ]),
      422,
      'SUBMISSION_INVALID',
    );
    const response = await submitAssignment(
      assignmentId,
      items.map((item) => ({
        itemId: item.id,
        selectedOptionId: item.options[0]!.id,
      })),
    ).expect(200);
    expect(response.body).toMatchObject({
      state: 'GRADED',
      grade: { percent: 100, level: '4+', letter: 'A+', rubricLevels: null, feedback: null },
    });
    const stored = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: fixture.schoolA.student.id,
        },
      },
      select: { status: true, gradePercent: true, gradedById: true },
    });
    expect(stored).toMatchObject({
      status: SubmissionStatus.GRADED,
      gradePercent: new Prisma.Decimal(100),
      gradedById: null,
    });
  });

  it('rejects different content when resubmission is off and keeps identical retries unchanged', async () => {
    const assignmentId = await createPublishedAssignment({
      title: 'Idempotent MCQ submit',
      dueAt: futureDueDate,
      blueprint: {
        items: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Choose.',
            options: [
              { text: 'Correct', isCorrect: true },
              { text: 'Incorrect', isCorrect: false },
            ],
          },
        ],
        rubric: null,
      },
    });
    const [item] = await getAssignmentItems(assignmentId);
    const correct = { itemId: item!.id, selectedOptionId: item!.options[0]!.id };
    const first = await submitAssignment(assignmentId, [correct]).expect(200);
    const before = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: fixture.schoolA.student.id,
        },
      },
      select: { submittedAt: true, gradePercent: true },
    });

    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { dueAt: new Date('2000-01-01T00:00:00.000Z') },
    });
    const retry = await submitAssignment(assignmentId, [correct]).expect(200);
    expect(retry.body).toEqual(first.body);
    expectError(
      await submitAssignment(assignmentId, [
        { itemId: item!.id, selectedOptionId: item!.options[1]!.id },
      ]),
      409,
      'SUBMISSION_ALREADY_EXISTS',
    );
    const after = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: fixture.schoolA.student.id,
        },
      },
      select: { submittedAt: true, gradePercent: true },
    });
    expect(after.submittedAt).toEqual(before.submittedAt);
    expect(after.gradePercent).toEqual(before.gradePercent);
    expect(retry.body.isLate).toBe(false);
  });

  it('replaces answers, clears teacher grading, and re-grades MCQ resubmissions', async () => {
    const textId = await createPublishedAssignment({
      title: 'Text replacement',
      dueAt: futureDueDate,
      blueprint: {
        allowResubmission: true,
        items: [{ type: 'TEXT', prompt: 'Explain.' }],
        rubric: null,
      },
    });
    const [textItem] = await getAssignmentItems(textId);
    await submitAssignment(textId, [{ itemId: textItem!.id, answerText: 'First.' }]).expect(200);
    const textSubmission = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId: textId,
          studentId: fixture.schoolA.student.id,
        },
      },
      select: { id: true, submittedAt: true },
    });
    await prisma.submission.update({
      where: { id: textSubmission.id },
      data: {
        status: SubmissionStatus.GRADED,
        gradePercent: new Prisma.Decimal(80),
        gradedAt: new Date(),
        gradedById: fixture.schoolA.teacher.id,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const replaced = await submitAssignment(textId, [
      { itemId: textItem!.id, answerText: 'Second.' },
    ]).expect(200);
    expect(replaced.body).toMatchObject({
      state: 'SUBMITTED',
      answers: [{ itemId: textItem!.id, answerText: 'Second.' }],
      grade: null,
    });
    const cleared = await prisma.submission.findUniqueOrThrow({
      where: { id: textSubmission.id },
      select: {
        submittedAt: true,
        status: true,
        gradePercent: true,
        rubricLevels: true,
        overallFeedback: true,
        gradedById: true,
        gradedAt: true,
      },
    });
    expect(cleared.submittedAt.getTime()).toBeGreaterThan(textSubmission.submittedAt.getTime());
    expect(cleared).toMatchObject({
      status: SubmissionStatus.SUBMITTED,
      gradePercent: null,
      rubricLevels: null,
      overallFeedback: null,
      gradedById: null,
      gradedAt: null,
    });

    const mcqId = await createPublishedAssignment({
      title: 'MCQ replacement',
      dueAt: futureDueDate,
      blueprint: {
        allowResubmission: true,
        items: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Choose.',
            options: [
              { text: 'Correct', isCorrect: true },
              { text: 'Incorrect', isCorrect: false },
            ],
          },
        ],
        rubric: null,
      },
    });
    const [mcqItem] = await getAssignmentItems(mcqId);
    const mcqAnswer = (optionIndex: number) => ({
      itemId: mcqItem!.id,
      selectedOptionId: mcqItem!.options[optionIndex]!.id,
    });
    await submitAssignment(mcqId, [mcqAnswer(0)]).expect(200);
    const regraded = await submitAssignment(mcqId, [mcqAnswer(1)]).expect(200);
    expect(regraded.body).toMatchObject({
      state: 'GRADED',
      grade: { percent: 0, level: 'R', letter: 'F' },
    });
  });

  it('collects validation errors for each answer rule and rejects file-upload assignments', async () => {
    const textId = await createPublishedAssignment({
      title: 'Validation answers',
      dueAt: futureDueDate,
      blueprint: {
        items: [{ type: 'TEXT', prompt: 'Short answer.', config: { maxLength: 4 } }],
        rubric: null,
      },
    });
    const otherTextId = await createPublishedAssignment({
      title: 'Foreign answer item',
      dueAt: futureDueDate,
      blueprint: { items: [{ type: 'TEXT', prompt: 'Other answer.' }], rubric: null },
    });
    const mcqId = await createPublishedAssignment({
      title: 'MCQ answer validation',
      dueAt: futureDueDate,
      blueprint: {
        items: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'One.',
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: false },
            ],
          },
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Two.',
            options: [
              { text: 'C', isCorrect: true },
              { text: 'D', isCorrect: false },
            ],
          },
        ],
        rubric: null,
      },
    });
    const fileId = await createPublishedAssignment({
      title: 'File submit guard',
      dueAt: futureDueDate,
      blueprint: {
        items: [
          {
            type: 'FILE_UPLOAD',
            prompt: 'Upload.',
            config: { maxFiles: 1, maxSizeMb: 1, allowedTypes: ['PDF'] },
          },
        ],
        rubric: null,
      },
    });
    const [textItem] = await getAssignmentItems(textId);
    const [foreignItem] = await getAssignmentItems(otherTextId);
    const mcqItems = await getAssignmentItems(mcqId);
    const unknownItemId = randomUUID();
    const invalidCases: Array<{
      assignmentId: string;
      answers: Array<{ itemId: string; selectedOptionId?: string; answerText?: string }>;
      itemId: string;
      rule: string;
    }> = [
      {
        assignmentId: textId,
        answers: [{ itemId: unknownItemId, answerText: 'x' }],
        itemId: unknownItemId,
        rule: 'unknownItem',
      },
      {
        assignmentId: textId,
        answers: [{ itemId: foreignItem!.id, answerText: 'x' }],
        itemId: foreignItem!.id,
        rule: 'unknownItem',
      },
      {
        assignmentId: textId,
        answers: [
          { itemId: textItem!.id, answerText: 'one' },
          { itemId: textItem!.id, answerText: 'two' },
        ],
        itemId: textItem!.id,
        rule: 'duplicateItem',
      },
      {
        assignmentId: textId,
        answers: [],
        itemId: textItem!.id,
        rule: 'required',
      },
      {
        assignmentId: mcqId,
        answers: [
          { itemId: mcqItems[0]!.id, selectedOptionId: mcqItems[1]!.options[0]!.id },
          { itemId: mcqItems[1]!.id, selectedOptionId: mcqItems[1]!.options[0]!.id },
        ],
        itemId: mcqItems[0]!.id,
        rule: 'selectedOptionInvalid',
      },
      {
        assignmentId: mcqId,
        answers: [
          { itemId: mcqItems[0]!.id, answerText: 'text' },
          { itemId: mcqItems[1]!.id, selectedOptionId: mcqItems[1]!.options[0]!.id },
        ],
        itemId: mcqItems[0]!.id,
        rule: 'selectedOptionRequired',
      },
      {
        assignmentId: textId,
        answers: [{ itemId: textItem!.id, answerText: '  ' }],
        itemId: textItem!.id,
        rule: 'answerTextRequired',
      },
      {
        assignmentId: textId,
        answers: [{ itemId: textItem!.id, answerText: '12345' }],
        itemId: textItem!.id,
        rule: 'answerTextTooLong',
      },
    ];
    for (const testCase of invalidCases) {
      const response = await submitAssignment(testCase.assignmentId, testCase.answers);
      expectError(response, 422, 'SUBMISSION_INVALID');
      expect(response.body.details).toContainEqual({
        itemId: testCase.itemId,
        rule: testCase.rule,
      });
    }
    await request(app.getHttpServer())
      .put(`/api/v1/learning/deliveries/${deliveryId}/assignments/${textId}/submission`)
      .set('Origin', origin)
      .set('Cookie', studentCookie)
      .send({
        answers: [{ itemId: textItem!.id, answerText: 'ok', unknown: true }],
      })
      .expect(400);
    expectError(await submitAssignment(fileId, []), 409, 'SUBMISSION_FILES_NOT_SUPPORTED');
  });

  it('serializes concurrent first submits and replacements without mixing answers', async () => {
    const identicalId = await createPublishedAssignment({
      title: 'Concurrent identical submit',
      dueAt: futureDueDate,
      blueprint: { items: [{ type: 'TEXT', prompt: 'Response.' }], rubric: null },
    });
    const [identicalItem] = await getAssignmentItems(identicalId);
    const identicalRequests = Array.from({ length: 5 }, () =>
      submitAssignment(identicalId, [{ itemId: identicalItem!.id, answerText: 'Same.' }]),
    );
    const identicalResponses = await Promise.all(identicalRequests);
    expect(identicalResponses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
    expect(identicalResponses.map(({ body }) => body)).toEqual(
      Array.from({ length: 5 }, () => identicalResponses[0]!.body),
    );
    expect(
      await prisma.submission.count({
        where: { assignmentId: identicalId, studentId: fixture.schoolA.student.id },
      }),
    ).toBe(1);

    const replaceId = await createPublishedAssignment({
      title: 'Concurrent replacement submit',
      dueAt: futureDueDate,
      blueprint: {
        allowResubmission: true,
        items: [{ type: 'TEXT', prompt: 'Response.' }],
        rubric: null,
      },
    });
    const [replaceItem] = await getAssignmentItems(replaceId);
    const values = ['First.', 'Second.', 'Third.', 'Fourth.', 'Fifth.'];
    const responses = await Promise.all(
      values.map((answerText) =>
        submitAssignment(replaceId, [{ itemId: replaceItem!.id, answerText }]),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
    const final = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId: replaceId,
          studentId: fixture.schoolA.student.id,
        },
      },
      select: { answers: { select: { itemId: true, answerText: true } } },
    });
    expect(values).toContain(final.answers[0]!.answerText);
    expect(final.answers).toEqual([
      { itemId: replaceItem!.id, answerText: final.answers[0]!.answerText },
    ]);
    expect(
      await prisma.submission.count({
        where: { assignmentId: replaceId, studentId: fixture.schoolA.student.id },
      }),
    ).toBe(1);
  });

  it('keeps peer submissions private and matches student read visibility and access failures', async () => {
    const peerBefore = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId: moduleAssignmentId,
          studentId: otherStudent.id,
        },
      },
      select: { id: true, submittedAt: true },
    });
    const [moduleItem] = await getAssignmentItems(moduleAssignmentId);
    await submitAssignment(moduleAssignmentId, [
      { itemId: moduleItem!.id, answerText: 'My own answer.' },
    ]).expect(200);
    const peerAfter = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId: moduleAssignmentId,
          studentId: otherStudent.id,
        },
      },
      select: { id: true, submittedAt: true },
    });
    expect(peerAfter).toEqual(peerBefore);
    expect(await prisma.submission.count({ where: { assignmentId: moduleAssignmentId } })).toBe(2);

    expectError(await submitAssignment(draftAssignmentId, []), 404, 'NOT_FOUND');
    expectError(await submitAssignment(unreleasedAssignmentId, []), 404, 'NOT_FOUND');
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/assignments/${unpublishedAssignmentId}/unpublish`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .expect(200);
    expectError(await submitAssignment(unpublishedAssignmentId, []), 404, 'NOT_FOUND');
    expectError(
      await submitAssignment(otherDeliveryAssignmentId, [], studentCookie, deliveryId),
      404,
      'NOT_FOUND',
    );
    expectError(
      await submitAssignment(otherDeliveryAssignmentId, [], studentCookie, otherDeliveryId),
      404,
      'NOT_FOUND',
    );
    expectError(
      await submitAssignment(foreignAssignmentId, [], foreignStudentCookie, foreignDeliveryId),
      404,
      'NOT_FOUND',
    );
    expectError(await submitAssignment(moduleAssignmentId, [], unenrolledCookie), 404, 'NOT_FOUND');
    expectError(
      await submitAssignment(moduleAssignmentId, [], teacherCookie),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(
      await submitAssignment(moduleAssignmentId, [], adminCookie),
      403,
      'PERMISSION_REQUIRED',
    );
    await submitAssignment(moduleAssignmentId, []).unset('Cookie').expect(401);

    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    expectError(await submitAssignment(moduleAssignmentId, []), 404, 'NOT_FOUND');
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.ACTIVE },
    });
    await prisma.deliveryEnrollment.update({
      where: { id: ownEnrollmentId },
      data: { status: EnrollmentStatus.REMOVED, endedAt: new Date() },
    });
    expectError(await submitAssignment(moduleAssignmentId, []), 404, 'NOT_FOUND');
    await prisma.deliveryEnrollment.update({
      where: { id: ownEnrollmentId },
      data: { status: EnrollmentStatus.ACTIVE, endedAt: null },
    });
    await prisma.$executeRaw`
      UPDATE subscriptions
      SET start_date = business_today() - 2, end_date = business_today() - 1
      WHERE id = ${subscriptionId}::uuid
    `;
    expectError(await submitAssignment(moduleAssignmentId, []), 403, 'SUBSCRIPTION_EXPIRED');
    await prisma.$executeRaw`
      UPDATE subscriptions
      SET start_date = business_today() - 1, end_date = business_today() + 30
      WHERE id = ${subscriptionId}::uuid
    `;
  });

  it('hides drafts, unpublished assignments, foreign delivery IDs, and unreleased lessons', async () => {
    expectError(await getAssignment(draftAssignmentId), 404, 'NOT_FOUND');
    expect((await getAssignment(archivedAssignmentId).expect(200)).body.id).toBe(
      archivedAssignmentId,
    );
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/assignments/${unpublishedAssignmentId}/unpublish`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .expect(200);
    expectError(await getAssignment(unpublishedAssignmentId), 404, 'NOT_FOUND');
    const remaining = await getAssignments().expect(200);
    expect(remaining.body.items.map((item: { id: string }) => item.id)).not.toContain(
      unpublishedAssignmentId,
    );
    expectError(await getAssignment(otherDeliveryAssignmentId), 404, 'NOT_FOUND');
    expectError(await getAssignment(foreignAssignmentId), 404, 'NOT_FOUND');
    expectError(await getAssignment(unreleasedAssignmentId), 404, 'NOT_FOUND');

    await prisma.deliveryLessonRelease.deleteMany({
      where: { deliveryId, lessonId: archivedLessonId },
    });
    expectError(await getAssignment(archivedAssignmentId), 404, 'NOT_FOUND');

    expectError(await getAssignment(teacherOnlyAssignmentId), 404, 'NOT_FOUND');
  });

  it('enforces access scope and subscription checks before assignment reads', async () => {
    expectError(await getAssignments({}, unenrolledCookie), 404, 'NOT_FOUND');
    expectError(await getAssignment(moduleAssignmentId, unenrolledCookie), 404, 'NOT_FOUND');
    await prisma.deliveryEnrollment.update({
      where: { id: ownEnrollmentId },
      data: { status: EnrollmentStatus.REMOVED, endedAt: new Date() },
    });
    expectError(await getAssignments(), 404, 'NOT_FOUND');
    expectError(await getAssignment(moduleAssignmentId), 404, 'NOT_FOUND');
    await prisma.deliveryEnrollment.update({
      where: { id: ownEnrollmentId },
      data: { status: EnrollmentStatus.ACTIVE, endedAt: null },
    });

    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    expectError(await getAssignments(), 404, 'NOT_FOUND');
    expectError(await getAssignment(moduleAssignmentId), 404, 'NOT_FOUND');
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.ACTIVE },
    });

    expectError(await getAssignments({}, foreignStudentCookie), 404, 'NOT_FOUND');
    expectError(await getAssignments({}, teacherCookie), 403, 'FORBIDDEN');
    expectError(await getAssignment(moduleAssignmentId, teacherCookie), 403, 'FORBIDDEN');
    expectError(await getAssignments({}, adminCookie), 403, 'FORBIDDEN');
    expectError(await getAssignment(moduleAssignmentId, adminCookie), 403, 'FORBIDDEN');
    await getAssignments().unset('Cookie').expect(401);
    await getAssignment(moduleAssignmentId).unset('Cookie').expect(401);

    await prisma.$executeRaw`
      UPDATE subscriptions
      SET start_date = business_today() - 2, end_date = business_today() - 1
      WHERE id = ${subscriptionId}::uuid
    `;
    expectError(await getAssignments(), 403, 'SUBSCRIPTION_EXPIRED');
    expectError(await getAssignment(moduleAssignmentId), 403, 'SUBSCRIPTION_EXPIRED');
    await prisma.$executeRaw`
      UPDATE subscriptions
      SET start_date = business_today() - 1, end_date = business_today() + 30
      WHERE id = ${subscriptionId}::uuid
    `;
  });
});
