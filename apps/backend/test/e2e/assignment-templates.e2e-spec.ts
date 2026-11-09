/** Covers assignment template CRUD, blueprint lifecycle, authorization, and defaults responses. */
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
import { addDateDays } from '../../src/subscriptions/subscription-rules.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';

const validTextBlueprint = {
  items: [{ type: 'TEXT', prompt: 'Explain your answer.', config: { maxLength: 2000 } }],
  rubric: null,
  allowResubmission: false,
};

const validChoiceBlueprint = {
  items: [
    {
      type: 'SINGLE_CHOICE',
      prompt: 'Choose the correct answer.',
      options: [
        { text: 'Correct', isCorrect: true },
        { text: 'Incorrect', isCorrect: false },
      ],
    },
  ],
  rubric: null,
  allowResubmission: false,
};

describe('Assignment template endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;
  let today: string;
  let revokeAdminPermission: (() => Promise<void>) | undefined;
  let createdPermission = false;
  const courseIds: string[] = [];
  const templateIds: string[] = [];
  const deliveryIds: string[] = [];
  const subscriptionIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Assignment template e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();

    const permission = await setupClient.permission.findUnique({
      where: { key: PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE },
      select: { id: true },
    });
    if (!permission) {
      await setupClient.permission.create({
        data: {
          key: PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE,
          description: 'Create and manage assignment templates',
        },
      });
      createdPermission = true;
    }
    revokeAdminPermission = (
      await grantPermissions(setupClient, 'admin', [PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE])
    ).revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Assignment template e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);
    [adminCookie, teacherCookie, studentCookie, today] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, fixture.schoolA.student),
      getToday(),
    ]);
  });

  afterAll(async () => {
    if (fixture) {
      const schoolIds = [fixture.schoolA.school.id, fixture.schoolB.school.id];
      await prisma.$transaction(async (tx) => {
        await tx.assignment.deleteMany({ where: { sourceTemplateId: { in: templateIds } } });
        await tx.assignmentTemplate.deleteMany({ where: { id: { in: templateIds } } });
        await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
        await tx.subscription.deleteMany({ where: { id: { in: subscriptionIds } } });
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
        ],
        schoolIds,
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await revokeAdminPermission?.();
    if (createdPermission) {
      await setupClient?.permission.deleteMany({
        where: { key: PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE },
      });
    }
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function getToday(): Promise<string> {
    const [row] = await prisma.$queryRaw<{ today: string }[]>`
      SELECT business_today()::text AS today
    `;
    if (!row) {
      throw new Error('business_today() did not return a date');
    }
    return row.today;
  }

  function postTemplate(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/assignment-templates')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function listTemplates(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/assignment-templates')
      .set('Cookie', cookie)
      .query(query);
  }

  function getTemplate(cookie: string, id: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/assignment-templates/${id}`)
      .set('Cookie', cookie);
  }

  function patchTemplate(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/assignment-templates/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchTemplateStatus(cookie: string, id: string, status: ContentStatus) {
    return request(app.getHttpServer())
      .patch(`/api/v1/assignment-templates/${id}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  function deleteTemplate(cookie: string, id: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/assignment-templates/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  async function createCourse(title: string, activate = false): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ title })
      .expect(201);
    const id = response.body.id as string;
    courseIds.push(id);
    if (activate) {
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${id}/status`)
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({ status: ContentStatus.ACTIVE })
        .expect(200);
    }
    return id;
  }

  async function createTemplate(
    courseId: string,
    blueprint: object = validTextBlueprint,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; courseId: string; status: ContentStatus }> {
    const response = await postTemplate(adminCookie, {
      courseId,
      title: `Template ${randomUUID().slice(0, 8)}`,
      blueprint,
      ...extra,
    });
    if (response.status !== 201) {
      throw new Error(`Template create failed: ${JSON.stringify(response.body)}`);
    }
    templateIds.push(response.body.id as string);
    return response.body as { id: string; courseId: string; status: ContentStatus };
  }

  async function createAnchors(courseId: string): Promise<{ moduleId: string; lessonId: string }> {
    const module = await prisma.module.create({
      data: {
        courseId,
        title: `Module ${randomUUID().slice(0, 8)}`,
        position: 1,
      },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        moduleId: module.id,
        title: `Lesson ${randomUUID().slice(0, 8)}`,
        position: 1,
      },
    });
    return { moduleId: module.id, lessonId: lesson.id };
  }

  it('creates default, module-anchored, and lesson-anchored draft templates', async () => {
    const courseId = await createCourse('Template CRUD course');
    const anchors = await createAnchors(courseId);

    const defaultTemplate = await postTemplate(adminCookie, {
      courseId,
      title: '  Default template  ',
      description: '  Draft description  ',
    }).expect(201);
    templateIds.push(defaultTemplate.body.id as string);
    expect(defaultTemplate.body).toMatchObject({
      title: 'Default template',
      status: ContentStatus.DRAFT,
      itemCount: 0,
      itemTypes: [],
      hasRubric: false,
      allowResubmission: false,
    });
    expect(defaultTemplate.body).not.toHaveProperty('blueprint');

    const moduleTemplate = await createTemplate(courseId, validTextBlueprint, {
      moduleId: anchors.moduleId,
    });
    const lessonTemplate = await createTemplate(courseId, validTextBlueprint, {
      lessonId: anchors.lessonId,
    });
    expect(moduleTemplate.courseId).toBe(courseId);
    expect(lessonTemplate.courseId).toBe(courseId);

    const detail = await getTemplate(adminCookie, defaultTemplate.body.id).expect(200);
    expect(detail.body).toMatchObject({
      courseId,
      moduleId: null,
      lessonId: null,
      description: 'Draft description',
      blueprint: { items: [], rubric: null, allowResubmission: false },
    });
  });

  it('rejects foreign anchors, archived courses, and requests with both anchors', async () => {
    const courseA = await createCourse('Anchor course A');
    const courseB = await createCourse('Anchor course B');
    const foreign = await createAnchors(courseB);
    await postTemplate(adminCookie, {
      courseId: courseA,
      title: 'Foreign module',
      moduleId: foreign.moduleId,
    }).expect(404);
    await postTemplate(adminCookie, {
      courseId: courseA,
      title: 'Foreign lesson',
      lessonId: foreign.lessonId,
    }).expect(404);

    const archivedCourse = await createCourse('Archived template course');
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${archivedCourse}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status: ContentStatus.ACTIVE })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${archivedCourse}/status`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ status: ContentStatus.ARCHIVED })
      .expect(200);
    const archived = await postTemplate(adminCookie, {
      courseId: archivedCourse,
      title: 'Archived course',
    }).expect(409);
    expect(archived.body.code).toBe('ASSIGNMENT_TEMPLATE_COURSE_ARCHIVED');

    const bothAnchors = await postTemplate(adminCookie, {
      courseId: courseA,
      title: 'Two anchors',
      moduleId: foreign.moduleId,
      lessonId: foreign.lessonId,
    }).expect(400);
    expect(bothAnchors.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects blueprint shape errors with dotted field details', async () => {
    const courseId = await createCourse('Invalid blueprint course');
    const response = await postTemplate(adminCookie, {
      courseId,
      title: 'Invalid shape',
      blueprint: {
        items: [{ type: 'TEXT', prompt: 'Write an answer.', options: [] }],
        rubric: null,
      },
    }).expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'blueprint.items.0.options' })]),
    );
    await postTemplate(adminCookie, {
      courseId,
      title: 'Null blueprint',
      blueprint: null,
    }).expect(400);
  });

  it('allows incomplete drafts, checks activation and active edits, and enforces lifecycle transitions', async () => {
    const courseId = await createCourse('Template lifecycle course');
    const incomplete = await createTemplate(courseId, {
      items: [
        {
          type: 'SINGLE_CHOICE',
          prompt: 'Select one.',
          options: [
            { text: 'A', isCorrect: false },
            { text: 'B', isCorrect: false },
          ],
        },
      ],
      rubric: null,
      allowResubmission: false,
    });
    const activation = await patchTemplateStatus(
      adminCookie,
      incomplete.id,
      ContentStatus.ACTIVE,
    ).expect(409);
    expect(activation.body.code).toBe('ASSIGNMENT_BLUEPRINT_INVALID');
    expect(activation.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'items.0.options', rule: 'exactlyOneCorrect' }),
      ]),
    );

    await patchTemplate(adminCookie, incomplete.id, { blueprint: validChoiceBlueprint }).expect(
      200,
    );
    const active = await patchTemplateStatus(
      adminCookie,
      incomplete.id,
      ContentStatus.ACTIVE,
    ).expect(200);
    expect(active.body.status).toBe(ContentStatus.ACTIVE);
    expect(active.body).not.toHaveProperty('blueprint');

    const invalidActiveEdit = await patchTemplate(adminCookie, incomplete.id, {
      blueprint: { items: [], rubric: null, allowResubmission: false },
    }).expect(409);
    expect(invalidActiveEdit.body.code).toBe('ASSIGNMENT_BLUEPRINT_INVALID');
    await patchTemplate(adminCookie, incomplete.id, { title: '  Active title  ' }).expect(200);

    await patchTemplateStatus(adminCookie, incomplete.id, ContentStatus.ARCHIVED).expect(200);
    await patchTemplateStatus(adminCookie, incomplete.id, ContentStatus.ACTIVE).expect(200);
    const toDraft = await patchTemplateStatus(
      adminCookie,
      incomplete.id,
      ContentStatus.DRAFT,
    ).expect(409);
    expect(toDraft.body.code).toBe('ASSIGNMENT_TEMPLATE_INVALID_STATUS_TRANSITION');

    const archivedDraft = await createTemplate(courseId, {
      items: [],
      rubric: null,
      allowResubmission: false,
    });
    await patchTemplateStatus(adminCookie, archivedDraft.id, ContentStatus.ARCHIVED).expect(200);
    const readOnly = await patchTemplate(adminCookie, archivedDraft.id, {
      title: 'Cannot update',
    }).expect(409);
    expect(readOnly.body.code).toBe('ASSIGNMENT_TEMPLATE_ARCHIVED');
    const archivedToDraft = await patchTemplateStatus(
      adminCookie,
      archivedDraft.id,
      ContentStatus.DRAFT,
    ).expect(409);
    expect(archivedToDraft.body.code).toBe('ASSIGNMENT_TEMPLATE_INVALID_STATUS_TRANSITION');
  });

  it('lists filtered paginated summaries without answer keys and deletes an unused template', async () => {
    const courseId = await createCourse('Template list course');
    const anchors = await createAnchors(courseId);
    const templateA = await createTemplate(courseId, validChoiceBlueprint, {
      moduleId: anchors.moduleId,
    });
    const templateB = await createTemplate(courseId, validTextBlueprint, {
      lessonId: anchors.lessonId,
    });

    const page = await listTemplates(adminCookie, { courseId, page: 1, limit: 1 }).expect(200);
    expect(page.body).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0]).not.toHaveProperty('blueprint');

    const byModule = await listTemplates(adminCookie, { moduleId: anchors.moduleId }).expect(200);
    expect(byModule.body.items.map((item: { id: string }) => item.id)).toContain(templateA.id);
    expect(byModule.body.items.map((item: { id: string }) => item.id)).not.toContain(templateB.id);
    const byLesson = await listTemplates(adminCookie, { lessonId: anchors.lessonId }).expect(200);
    expect(byLesson.body.items.map((item: { id: string }) => item.id)).toEqual([templateB.id]);
    const drafts = await listTemplates(adminCookie, {
      courseId,
      status: ContentStatus.DRAFT,
    }).expect(200);
    expect(drafts.body.total).toBe(2);

    const detail = await getTemplate(adminCookie, templateA.id).expect(200);
    expect(detail.body.blueprint.items[0].options[0].isCorrect).toBe(true);

    const removable = await createTemplate(courseId);
    await deleteTemplate(adminCookie, removable.id).expect(204);
    const missing = await getTemplate(adminCookie, removable.id).expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('blocks deletion while an assignment copy references the template', async () => {
    const courseId = await createCourse('Template copy course', true);
    const template = await createTemplate(courseId);
    const subscriptionId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO subscriptions (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
      VALUES (
        ${subscriptionId}::uuid,
        ${fixture.schoolA.school.id}::uuid,
        ${courseId}::uuid,
        ${today}::date,
        ${addDateDays(today, 30)}::date,
        5,
        now()
      )
    `;
    subscriptionIds.push(subscriptionId);
    const delivery = await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({
        schoolId: fixture.schoolA.school.id,
        courseId,
        academicYear: '2034-35',
        label: `Template copy ${randomUUID().slice(0, 8)}`,
      })
      .expect(201);
    deliveryIds.push(delivery.body.id as string);
    await prisma.assignment.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId: delivery.body.id as string,
        courseId,
        title: 'Copied assignment',
        sourceTemplateId: template.id,
        createdById: fixture.admin.id,
      },
    });

    const blocked = await deleteTemplate(adminCookie, template.id).expect(409);
    expect(blocked.body.code).toBe('RESOURCE_IN_USE');
  });

  it('serves static defaults to authenticated users without template permission', async () => {
    const defaults = await request(app.getHttpServer())
      .get('/api/v1/assignments/defaults')
      .set('Cookie', teacherCookie)
      .expect(200);
    expect(defaults.body).toMatchObject({
      rubric: {
        size: 4,
        categories: [
          { name: 'Knowledge', description: null },
          { name: 'Thinking', description: null },
          { name: 'Application', description: null },
          { name: 'Communication', description: null },
        ],
      },
      gradeLevels: expect.arrayContaining([
        { code: '4+', letter: 'A+' },
        { code: 'R', letter: 'F' },
      ]),
      limits: {
        maxItems: 50,
        promptMaxLength: 5000,
        options: { min: 2, max: 6, textMaxLength: 500 },
        rubric: { nameMaxLength: 60, descriptionMaxLength: 500 },
        text: { maxLength: 20000 },
        fileUpload: {
          minFiles: 1,
          maxFiles: 5,
          minSizeMb: 1,
          maxSizeMb: 25,
          allowedTypes: ['PDF', 'IMAGE', 'PRESENTATION'],
        },
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/assignments/defaults')
      .set('Cookie', studentCookie)
      .expect(200);
    await request(app.getHttpServer()).get('/api/v1/assignments/defaults').expect(401);
  });

  it('returns 401 without authentication and 403 to teachers and students on every template route', async () => {
    const courseId = await createCourse('Template permission course');
    const template = await createTemplate(courseId);
    const calls = [
      (cookie?: string) => {
        let call = request(app.getHttpServer()).get('/api/v1/assignment-templates');
        return cookie ? call.set('Cookie', cookie) : call;
      },
      (cookie?: string) => {
        let call = request(app.getHttpServer())
          .post('/api/v1/assignment-templates')
          .set('Origin', origin)
          .send({ courseId, title: 'Forbidden create' });
        return cookie ? call.set('Cookie', cookie) : call;
      },
      (cookie?: string) => {
        let call = request(app.getHttpServer()).get(`/api/v1/assignment-templates/${template.id}`);
        return cookie ? call.set('Cookie', cookie) : call;
      },
      (cookie?: string) => {
        let call = request(app.getHttpServer())
          .patch(`/api/v1/assignment-templates/${template.id}`)
          .set('Origin', origin)
          .send({ title: 'Forbidden update' });
        return cookie ? call.set('Cookie', cookie) : call;
      },
      (cookie?: string) => {
        let call = request(app.getHttpServer())
          .patch(`/api/v1/assignment-templates/${template.id}/status`)
          .set('Origin', origin)
          .send({ status: ContentStatus.ACTIVE });
        return cookie ? call.set('Cookie', cookie) : call;
      },
      (cookie?: string) => {
        let call = request(app.getHttpServer())
          .delete(`/api/v1/assignment-templates/${template.id}`)
          .set('Origin', origin);
        return cookie ? call.set('Cookie', cookie) : call;
      },
    ];

    for (const call of calls) {
      await call().expect(401);
      await call(teacherCookie).expect(403);
      await call(studentCookie).expect(403);
    }
  });
});
