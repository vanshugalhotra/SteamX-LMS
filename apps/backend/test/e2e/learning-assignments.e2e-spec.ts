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
