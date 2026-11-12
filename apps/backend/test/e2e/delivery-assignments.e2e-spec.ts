/** Covers delivery assignment creation, lifecycle, content locks, visibility, and counts. */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { Env } from '../../src/config/env.schema.js';
import {
  AssignmentStatus,
  ContentStatus,
  DeliveryStatus,
  LessonAudience,
  Prisma,
  PrismaClient,
  SubmissionStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createTestTeacher,
  createTwoSchoolFixture,
  TENANCY_TEST_PASSWORD,
  type TwoSchoolFixture,
  type TestUserFixture,
} from '../support/factories/fixtures.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';
import { loginAsCookie } from '../support/login.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';

const textBlueprint = {
  items: [{ type: 'TEXT', prompt: 'Explain your answer.', config: { maxLength: 2000 } }],
  rubric: null,
  allowResubmission: false,
};

const choiceBlueprint = {
  items: [
    {
      type: 'SINGLE_CHOICE',
      prompt: 'Choose the answer.',
      options: [
        { text: 'Correct', isCorrect: true },
        { text: 'Incorrect', isCorrect: false },
      ],
    },
  ],
  rubric: null,
  allowResubmission: false,
};

const rubricBlueprint = {
  items: [{ type: 'TEXT', prompt: 'Explain your answer.', config: { maxLength: 2000 } }],
  rubric: [
    { name: 'Knowledge', description: 'Original knowledge text' },
    { name: 'Thinking', description: null },
    { name: 'Application', description: null },
    { name: 'Communication', description: null },
  ],
  allowResubmission: false,
};

const dueAt = '2099-12-31T23:59:59.000Z';

describe('Delivery assignment endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let extraTeacher: TestUserFixture;
  let unassignedTeacher: TestUserFixture;
  let origin: string;
  let adminCookie: string;
  let teacherCookie: string;
  let extraTeacherCookie: string;
  let unassignedTeacherCookie: string;
  let foreignTeacherCookie: string;
  let studentCookie: string;
  let deliveryId: string;
  let secondDeliveryId: string;
  let courseId: string;
  let moduleId: string;
  let lessonId: string;
  let teacherOnlyLessonId: string;
  let subscriptionId: string;
  let revokeTeacherPermission: (() => Promise<void>) | undefined;
  const courseIds: string[] = [];
  const deliveryIds: string[] = [];
  const templateIds: string[] = [];
  const assignmentIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Delivery assignment e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    revokeTeacherPermission = (
      await grantPermissions(setupClient, 'teacher', [PERMISSION.ASSIGNMENT_MANAGE])
    ).revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Delivery assignment e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);

    const course = await prisma.course.create({
      data: { title: `Assignment e2e ${randomUUID()}`, status: ContentStatus.ACTIVE },
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
        maxDeliveries: 1000,
      },
      select: { id: true },
    });
    subscriptionId = subscription.id;
    deliveryId = await createDelivery();
    secondDeliveryId = await createDelivery();
    const module = await prisma.module.create({
      data: { courseId, title: `Assignment module ${randomUUID()}`, position: 1 },
      select: { id: true },
    });
    moduleId = module.id;
    await prisma.module.update({
      where: { id: moduleId },
      data: { status: ContentStatus.ACTIVE },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        moduleId,
        title: `Student lesson ${randomUUID()}`,
        position: 1,
        status: ContentStatus.ACTIVE,
        audience: LessonAudience.STUDENT,
      },
      select: { id: true },
    });
    lessonId = lesson.id;
    const teacherOnlyLesson = await prisma.lesson.create({
      data: {
        courseId,
        moduleId,
        title: `Teacher-only lesson ${randomUUID()}`,
        position: 2,
        status: ContentStatus.ACTIVE,
        audience: LessonAudience.TEACHER_ONLY,
      },
      select: { id: true },
    });
    teacherOnlyLessonId = teacherOnlyLesson.id;

    const hash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);
    extraTeacher = await prisma.$transaction((tx) =>
      createTestTeacher(tx, fixture.schoolA.school.id, hash, 'Assignment peer teacher'),
    );
    unassignedTeacher = await prisma.$transaction((tx) =>
      createTestTeacher(tx, fixture.schoolA.school.id, hash, 'Unassigned assignment teacher'),
    );
    await prisma.deliveryTeacher.createMany({
      data: [
        { schoolId: fixture.schoolA.school.id, deliveryId, teacherId: fixture.schoolA.teacher.id },
        { schoolId: fixture.schoolA.school.id, deliveryId, teacherId: extraTeacher.id },
        {
          schoolId: fixture.schoolA.school.id,
          deliveryId: secondDeliveryId,
          teacherId: fixture.schoolA.teacher.id,
        },
      ],
    });
    [
      adminCookie,
      teacherCookie,
      extraTeacherCookie,
      unassignedTeacherCookie,
      foreignTeacherCookie,
      studentCookie,
    ] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, extraTeacher),
      loginAsCookie(app, unassignedTeacher),
      loginAsCookie(app, fixture.schoolB.teacher),
      loginAsCookie(app, fixture.schoolA.student),
    ]);
  });

  afterAll(async () => {
    if (fixture) {
      await prisma.$transaction(async (tx) => {
        await tx.submissionAnswer.deleteMany({
          where: { submission: { assignmentId: { in: assignmentIds } } },
        });
        await tx.submissionFile.deleteMany({
          where: { submission: { assignmentId: { in: assignmentIds } } },
        });
        await tx.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        await tx.deliveryEnrollment.deleteMany({
          where: { deliveryId: { in: deliveryIds } },
        });
        await tx.assignmentItemOption.deleteMany({
          where: { item: { is: { assignmentId: { in: assignmentIds } } } },
        });
        await tx.assignmentItem.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        await tx.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
        await tx.assignmentTemplate.deleteMany({ where: { id: { in: templateIds } } });
        await tx.deliveryTeacher.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
        await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
        await tx.subscription.deleteMany({ where: { id: subscriptionId } });
        await tx.lesson.deleteMany({ where: { courseId: { in: courseIds } } });
        await tx.module.deleteMany({ where: { courseId: { in: courseIds } } });
        await tx.course.deleteMany({ where: { id: { in: courseIds } } });
      });
      await cleanupFixtures(
        prisma,
        [
          fixture.admin.id,
          fixture.schoolA.teacher.id,
          fixture.schoolA.student.id,
          fixture.schoolB.teacher.id,
          fixture.schoolB.student.id,
          extraTeacher?.id,
          unassignedTeacher?.id,
        ].filter((id): id is string => id !== undefined),
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await revokeTeacherPermission?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function createDelivery(): Promise<string> {
    const nextYear = 2500 + deliveryIds.length;
    return prisma.delivery
      .create({
        data: {
          schoolId: fixture.schoolA.school.id,
          courseId,
          label: `Assignment delivery ${randomUUID()}`,
          academicYear: `${nextYear}-01`,
          status: DeliveryStatus.ACTIVE,
        },
        select: { id: true },
      })
      .then(({ id }) => {
        deliveryIds.push(id);
        return id;
      });
  }

  function postAssignment(body: object, targetDeliveryId = deliveryId) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${targetDeliveryId}/assignments`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .send(body);
  }

  function postTemplateCopy(body: object) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/assignments/from-template`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .send(body);
  }

  function patchAssignment(id: string, body: object, cookie = teacherCookie) {
    return request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${deliveryId}/assignments/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function publishAssignment(id: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/assignments/${id}/publish`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie);
  }

  function unpublishAssignment(id: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/assignments/${id}/unpublish`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie);
  }

  function containsKey(value: unknown, key: string): boolean {
    if (Array.isArray(value)) {
      return value.some((entry) => containsKey(entry, key));
    }
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    return (
      Object.hasOwn(value, key) || Object.values(value).some((entry) => containsKey(entry, key))
    );
  }

  async function createTemplate(
    blueprint: typeof textBlueprint | typeof choiceBlueprint | typeof rubricBlueprint,
    options: { status?: ContentStatus; forCourseId?: string } = {},
  ): Promise<string> {
    const template = await prisma.assignmentTemplate.create({
      data: {
        courseId: options.forCourseId ?? courseId,
        title: `Template ${randomUUID()}`,
        status: options.status ?? ContentStatus.ACTIVE,
        blueprint: JSON.parse(JSON.stringify(blueprint)) as Prisma.InputJsonValue,
        createdById: fixture.admin.id,
      },
      select: { id: true },
    });
    templateIds.push(template.id);
    return template.id;
  }

  it('creates drafts with course-scoped module and lesson anchors', async () => {
    const draft = await postAssignment({ title: '  Incomplete draft  ' }).expect(201);
    assignmentIds.push(draft.body.id);
    expect(draft.body).toMatchObject({
      title: 'Incomplete draft',
      status: AssignmentStatus.DRAFT,
      items: [],
      rubric: null,
      allowResubmission: false,
      contentEditable: true,
    });
    await patchAssignment(draft.body.id, { title: 'Draft metadata edit' }).expect(200);

    const moduleDraft = await postAssignment({ title: 'Module anchor', moduleId }).expect(201);
    assignmentIds.push(moduleDraft.body.id);
    const lessonDraft = await postAssignment({ title: 'Lesson anchor', lessonId }).expect(201);
    assignmentIds.push(lessonDraft.body.id);

    const otherCourse = await prisma.course.create({
      data: { title: `Other course ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    courseIds.push(otherCourse.id);
    const otherModule = await prisma.module.create({
      data: { courseId: otherCourse.id, title: 'Foreign anchor', position: 1 },
      select: { id: true },
    });
    await prisma.module.update({
      where: { id: otherModule.id },
      data: { status: ContentStatus.ACTIVE },
    });
    const otherLesson = await prisma.lesson.create({
      data: {
        courseId: otherCourse.id,
        moduleId: otherModule.id,
        title: 'Foreign lesson anchor',
        position: 1,
        status: ContentStatus.ACTIVE,
        audience: LessonAudience.STUDENT,
      },
      select: { id: true },
    });
    expectError(
      await postAssignment({ title: 'Foreign module', moduleId: otherModule.id }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await postAssignment({ title: 'Foreign lesson', lessonId: otherLesson.id }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await postAssignment({ title: 'Both anchors', moduleId, lessonId }),
      400,
      'VALIDATION_ERROR',
    );
    const unused = await postAssignment({ title: 'Unused assignment' }).expect(201);
    assignmentIds.push(unused.body.id);
    await request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/assignments/${unused.body.id}`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .expect(204);
  });

  it('copies templates with text-only rubric overrides and suppresses answer keys', async () => {
    const templateId = await createTemplate(rubricBlueprint);
    const copy = await postTemplateCopy({
      templateId,
      title: 'Copied assignment',
      dueAt,
      rubric: [
        { name: 'Knowledge updated', description: 'Updated description' },
        { name: 'Thinking', description: null },
        { name: 'Application', description: null },
        { name: 'Communication', description: null },
      ],
    }).expect(201);
    assignmentIds.push(copy.body.id);
    expect(copy.body).toMatchObject({
      title: 'Copied assignment',
      status: AssignmentStatus.DRAFT,
      rubric: [
        { name: 'Knowledge updated', description: 'Updated description' },
        { name: 'Thinking', description: null },
        { name: 'Application', description: null },
        { name: 'Communication', description: null },
      ],
      items: [{ position: 1, options: [] }],
      contentEditable: false,
    });
    expect(containsKey(copy.body, 'isCorrect')).toBe(false);
    expectError(
      await postTemplateCopy({ templateId }),
      409,
      'TEMPLATE_ALREADY_PUBLISHED_TO_DELIVERY',
    );
    expectError(
      await patchAssignment(copy.body.id, { items: textBlueprint.items }),
      409,
      'ASSIGNMENT_CONTENT_LOCKED',
    );
    await patchAssignment(copy.body.id, {
      rubric: [
        { name: 'One', description: null },
        { name: 'Two', description: null },
        { name: 'Three', description: null },
        { name: 'Four', description: null },
      ],
    }).expect(200);
    const choiceTemplate = await createTemplate(choiceBlueprint);
    const choiceCopy = await postTemplateCopy({ templateId: choiceTemplate }).expect(201);
    assignmentIds.push(choiceCopy.body.id);
    expect(
      choiceCopy.body.items[0].options.map((option: { position: number }) => option.position),
    ).toEqual([1, 2]);
    expect(containsKey(choiceCopy.body, 'isCorrect')).toBe(false);
    const noRubricTemplate = await createTemplate(textBlueprint);
    expectError(
      await postTemplateCopy({
        templateId: noRubricTemplate,
        rubric: [
          { name: 'One', description: null },
          { name: 'Two', description: null },
          { name: 'Three', description: null },
          { name: 'Four', description: null },
        ],
      }),
      400,
      'VALIDATION_ERROR',
    );
    const inactiveTemplate = await createTemplate(textBlueprint, { status: ContentStatus.DRAFT });
    expectError(await postTemplateCopy({ templateId: inactiveTemplate }), 404, 'NOT_FOUND');
    const otherCourse = await prisma.course.create({
      data: { title: `Template course ${randomUUID()}`, status: ContentStatus.ACTIVE },
      select: { id: true },
    });
    courseIds.push(otherCourse.id);
    const foreignTemplate = await createTemplate(textBlueprint, { forCourseId: otherCourse.id });
    expectError(await postTemplateCopy({ templateId: foreignTemplate }), 404, 'NOT_FOUND');
  });

  it('validates publish checklist order, retries lifecycle operations, and locks content', async () => {
    const noDueDate = await postAssignment({
      title: 'No due date',
      blueprint: textBlueprint,
    }).expect(201);
    assignmentIds.push(noDueDate.body.id);
    expectError(await publishAssignment(noDueDate.body.id), 409, 'ASSIGNMENT_DUE_DATE_REQUIRED');
    expectError(
      await unpublishAssignment(noDueDate.body.id),
      409,
      'ASSIGNMENT_UNPUBLISHED_FROM_DRAFT',
    );

    const incomplete = await postAssignment({
      title: 'Incomplete',
      dueAt,
      blueprint: { items: [], rubric: null },
    }).expect(201);
    assignmentIds.push(incomplete.body.id);
    expectError(await publishAssignment(incomplete.body.id), 409, 'ASSIGNMENT_BLUEPRINT_INVALID');

    const teacherOnly = await postAssignment({
      title: 'Teacher lesson',
      lessonId: teacherOnlyLessonId,
      dueAt,
      blueprint: textBlueprint,
    }).expect(201);
    assignmentIds.push(teacherOnly.body.id);
    expectError(
      await publishAssignment(teacherOnly.body.id),
      409,
      'ASSIGNMENT_LESSON_NOT_STUDENT_FACING',
    );

    const own = await postAssignment({
      title: 'Published assignment',
      dueAt,
      blueprint: choiceBlueprint,
    }).expect(201);
    assignmentIds.push(own.body.id);
    expect(containsKey(own.body, 'isCorrect')).toBe(true);
    const published = await publishAssignment(own.body.id).expect(200);
    expect(published.body.status).toBe(AssignmentStatus.PUBLISHED);
    expect(published.body.publishedAt).toBeTruthy();
    expect(published.body.items[0].position).toBe(1);
    const originalPublishedAt = published.body.publishedAt;
    expect((await publishAssignment(own.body.id).expect(200)).body.publishedAt).toBe(
      originalPublishedAt,
    );
    await patchAssignment(own.body.id, { title: 'Metadata is always editable' }).expect(200);
    expectError(
      await patchAssignment(own.body.id, { items: textBlueprint.items }),
      409,
      'ASSIGNMENT_CONTENT_LOCKED',
    );
    const unpublished = await unpublishAssignment(own.body.id).expect(200);
    expect(unpublished.body.status).toBe(AssignmentStatus.UNPUBLISHED);
    expect(unpublished.body.publishedAt).toBe(originalPublishedAt);
    await patchAssignment(own.body.id, { title: 'Unpublished metadata edit' }).expect(200);
    const originalItemId = unpublished.body.items[0].id;
    const edited = await patchAssignment(own.body.id, { items: choiceBlueprint.items }).expect(200);
    expect(edited.body.items[0].id).not.toBe(originalItemId);
    expect((await unpublishAssignment(own.body.id).expect(200)).body.status).toBe(
      AssignmentStatus.UNPUBLISHED,
    );
    const republished = await publishAssignment(own.body.id).expect(200);
    expect(republished.body.publishedAt).toBe(originalPublishedAt);

    const removable = await postAssignment({
      title: 'Published but unused',
      dueAt,
      blueprint: choiceBlueprint,
    }).expect(201);
    assignmentIds.push(removable.body.id);
    await publishAssignment(removable.body.id).expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/assignments/${removable.body.id}`)
      .set('Origin', origin)
      .set('Cookie', teacherCookie)
      .expect(204);
  });

  it('counts submissions, blocks deletion, and allows all active delivery teachers', async () => {
    const published = await prisma.assignment.findFirstOrThrow({
      where: { id: { in: assignmentIds }, status: AssignmentStatus.PUBLISHED },
      select: { id: true },
    });
    await prisma.deliveryEnrollment.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId,
        studentId: fixture.schoolA.student.id,
        enrolledById: fixture.schoolA.teacher.id,
      },
    });
    await prisma.submission.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId,
        assignmentId: published.id,
        studentId: fixture.schoolA.student.id,
      },
    });
    await prisma.submission.update({
      where: {
        assignmentId_studentId: {
          assignmentId: published.id,
          studentId: fixture.schoolA.student.id,
        },
      },
      data: {
        status: SubmissionStatus.GRADED,
        gradePercent: new Prisma.Decimal(100),
        gradedAt: new Date(),
        gradedById: fixture.schoolA.teacher.id,
      },
    });
    await patchAssignment(published.id, { title: 'Published metadata with submission' }).expect(
      200,
    );
    await unpublishAssignment(published.id).expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${published.id}`)
      .set('Cookie', teacherCookie)
      .expect(200);
    expect(detail.body.contentEditable).toBe(false);
    await patchAssignment(published.id, { title: 'Metadata with submission' }).expect(200);
    expectError(
      await patchAssignment(published.id, { items: textBlueprint.items }),
      409,
      'ASSIGNMENT_CONTENT_LOCKED',
    );
    expectError(
      await request(app.getHttpServer())
        .delete(`/api/v1/deliveries/${deliveryId}/assignments/${published.id}`)
        .set('Origin', origin)
        .set('Cookie', teacherCookie),
      409,
      'ASSIGNMENT_HAS_SUBMISSIONS',
    );

    const list = await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments`)
      .set('Cookie', teacherCookie)
      .expect(200);
    const summary = list.body.items.find((item: { id: string }) => item.id === published.id);
    expect(summary).toMatchObject({ itemCount: 1, submissionCount: 1, gradedCount: 1 });

    await patchAssignment(published.id, { title: 'Peer teacher edit' }, extraTeacherCookie).expect(
      200,
    );
  });

  it('keeps reads available after expiry and applies route/access scoping', async () => {
    const assignmentId = assignmentIds[0]!;
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${assignmentId}`)
      .set('Cookie', foreignTeacherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${assignmentId}`)
      .set('Cookie', unassignedTeacherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${assignmentId}`)
      .set('Cookie', studentCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${assignmentId}`)
      .set('Cookie', adminCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${assignmentId}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${secondDeliveryId}/assignments/${assignmentIds[1]}`)
      .set('Cookie', teacherCookie)
      .expect(404);

    await prisma.deliveryTeacher.updateMany({
      where: { deliveryId, teacherId: extraTeacher.id },
      data: { removedAt: new Date(), removedById: fixture.admin.id },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments/${assignmentId}`)
      .set('Cookie', extraTeacherCookie)
      .expect(404);

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { endDate: new Date('2000-01-02T00:00:00.000Z') },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/assignments`)
      .set('Cookie', teacherCookie)
      .expect(200);
    expectError(
      await patchAssignment(assignmentId, { title: 'Expired write' }),
      403,
      'SUBSCRIPTION_EXPIRED',
    );
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { endDate: new Date('2099-12-31T00:00:00.000Z') },
    });
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    expectError(await postAssignment({ title: 'Inactive delivery' }), 409, 'DELIVERY_NOT_ACTIVE');
    expectError(await publishAssignment(assignmentId), 409, 'DELIVERY_NOT_ACTIVE');
  });
});
