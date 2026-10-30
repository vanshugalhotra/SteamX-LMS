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
import { ContentStatus, DeliveryStatus, SchoolStatus } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { addDateDays, calculateRetainedUntil } from '../../src/subscriptions/subscription-rules.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';

describe('Subscriptions endpoints (e2e)', () => {
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
  const createdCourseIds: string[] = [];
  let deliveryYear = 2030;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Subscriptions e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const permission = await setupClient.permission.findUnique({
      where: { key: PERMISSION.SUBSCRIPTION_MANAGE },
      select: { id: true },
    });
    if (!permission) {
      await setupClient.permission.create({
        data: {
          key: PERMISSION.SUBSCRIPTION_MANAGE,
          description: 'Grant and manage school course subscriptions',
        },
      });
      createdPermission = true;
    }
    revokeAdminPermission = (
      await grantPermissions(setupClient, 'admin', [PERMISSION.SUBSCRIPTION_MANAGE])
    ).revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Subscriptions e2e tests require a configured CORS_ORIGINS entry.');
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
        await tx.delivery.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.subscription.deleteMany({ where: { schoolId: { in: schoolIds } } });
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
    await revokeAdminPermission?.();
    if (createdPermission) {
      await setupClient?.permission.deleteMany({
        where: { key: PERMISSION.SUBSCRIPTION_MANAGE },
      });
    }
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function getToday(): Promise<string> {
    const [result] = await prisma.$queryRaw<{ today: string }[]>`
      SELECT business_today()::text AS today
    `;
    if (!result) {
      throw new Error('business_today() did not return a date');
    }
    return result.today;
  }

  async function createActiveCourse(
    status: ContentStatus = ContentStatus.ACTIVE,
  ): Promise<{ id: string }> {
    const course = await prisma.course.create({
      data: { title: `Subscription course ${randomUUID()}`, status },
      select: { id: true },
    });
    createdCourseIds.push(course.id);
    return course;
  }

  function createSubscription(cookie: string, body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function listSubscriptions(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .set('Cookie', cookie)
      .query(query);
  }

  function getSubscription(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/v1/subscriptions/${id}`).set('Cookie', cookie);
  }

  function patchSubscription(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function revokeSubscription(cookie: string, id: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${id}/revoke`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function renewSubscription(cookie: string, id: string, body: object) {
    return request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  async function grant(
    courseId: string,
    range: { startDate?: string; endDate?: string } = {},
    schoolId = fixture.schoolA.school.id,
    maxDeliveries = 3,
  ) {
    const body = {
      schoolId,
      courseId,
      startDate: range.startDate ?? today,
      endDate: range.endDate ?? addDateDays(today, 30),
      maxDeliveries,
    };
    const response = await createSubscription(adminCookie, body).expect(201);
    return response.body as {
      id: string;
      schoolId: string;
      courseId: string;
      startDate: string;
      endDate: string;
      maxDeliveries: number;
      retainedUntil: string;
      activeDeliveries: number;
      status: string;
    };
  }

  async function createActiveDelivery(courseId: string): Promise<void> {
    deliveryYear += 1;
    await prisma.delivery.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        classSectionId: fixture.schoolA.section.id,
        academicYear: `${deliveryYear}-${(deliveryYear + 1).toString().slice(-2)}`,
        status: DeliveryStatus.ACTIVE,
      },
    });
  }

  it('grants, returns derived fields, and maps overlapping and adjacent dates', async () => {
    const course = await createActiveCourse();
    const first = await grant(course.id, {
      startDate: today,
      endDate: addDateDays(today, 2),
    });
    expect(first).toMatchObject({
      schoolId: fixture.schoolA.school.id,
      courseId: course.id,
      schoolName: fixture.schoolA.school.name,
      courseTitle: expect.stringContaining('Subscription course'),
      startDate: today,
      endDate: addDateDays(today, 2),
      maxDeliveries: 3,
      retainedUntil: calculateRetainedUntil(addDateDays(today, 2)),
      activeDeliveries: 0,
      status: 'ACTIVE',
    });

    const overlapBody = {
      schoolId: fixture.schoolA.school.id,
      courseId: course.id,
      startDate: addDateDays(today, 2),
      endDate: addDateDays(today, 5),
      maxDeliveries: 3,
    };
    const overlap = await createSubscription(adminCookie, overlapBody);
    expectError(overlap, 409, 'SUBSCRIPTION_OVERLAP');

    await grant(course.id, {
      startDate: addDateDays(today, 3),
      endDate: addDateDays(today, 5),
    });
    expectError(
      await patchSubscription(adminCookie, first.id, {
        endDate: addDateDays(today, 3),
      }),
      409,
      'SUBSCRIPTION_OVERLAP',
    );
  });

  it('rejects invalid input, inactive courses, and an unknown school', async () => {
    const activeCourse = await createActiveCourse();
    const draftCourse = await createActiveCourse(ContentStatus.DRAFT);
    const archivedCourse = await createActiveCourse(ContentStatus.ARCHIVED);
    const base = {
      schoolId: fixture.schoolA.school.id,
      courseId: activeCourse.id,
      startDate: today,
      endDate: addDateDays(today, 1),
      maxDeliveries: 2,
    };

    expectError(
      await createSubscription(adminCookie, { ...base, schoolId: randomUUID() }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await createSubscription(adminCookie, { ...base, courseId: draftCourse.id }),
      409,
      'COURSE_NOT_ACTIVE',
    );
    expectError(
      await createSubscription(adminCookie, { ...base, courseId: archivedCourse.id }),
      409,
      'COURSE_NOT_ACTIVE',
    );
    await prisma.school.update({
      where: { id: fixture.schoolB.school.id },
      data: { status: SchoolStatus.INACTIVE },
    });
    try {
      expectError(
        await createSubscription(adminCookie, {
          ...base,
          schoolId: fixture.schoolB.school.id,
        }),
        409,
        'SCHOOL_INACTIVE',
      );
    } finally {
      await prisma.school.update({
        where: { id: fixture.schoolB.school.id },
        data: { status: SchoolStatus.ACTIVE },
      });
    }
    expectError(
      await createSubscription(adminCookie, {
        ...base,
        startDate: addDateDays(today, 2),
        endDate: today,
      }),
      400,
      'SUBSCRIPTION_INVALID_DATE_RANGE',
    );
    await createSubscription(adminCookie, {
      ...base,
      startDate: `${today}T00:00:00.000Z`,
    }).expect(400);
    await createSubscription(adminCookie, { ...base, maxDeliveries: 0 }).expect(400);
  });

  it('filters by school, course, status, and paginates newest start date first', async () => {
    const course = await createActiveCourse();
    const otherCourse = await createActiveCourse();
    const expired = await grant(course.id, {
      startDate: addDateDays(today, -10),
      endDate: addDateDays(today, -5),
    });
    const active = await grant(course.id, { startDate: today, endDate: addDateDays(today, 4) });
    const upcoming = await grant(course.id, {
      startDate: addDateDays(today, 6),
      endDate: addDateDays(today, 10),
    });
    const otherSchool = await grant(
      course.id,
      { startDate: today, endDate: addDateDays(today, 2) },
      fixture.schoolB.school.id,
    );
    await grant(otherCourse.id, { startDate: today, endDate: addDateDays(today, 2) });

    for (const [status, expectedId] of [
      ['UPCOMING', upcoming.id],
      ['ACTIVE', active.id],
      ['EXPIRED', expired.id],
    ] as const) {
      const filtered = await listSubscriptions(adminCookie, { status }).expect(200);
      expect(filtered.body.items.map((item: { id: string }) => item.id)).toContain(expectedId);
      expect(filtered.body.items.every((item: { status: string }) => item.status === status)).toBe(
        true,
      );
    }

    const bySchool = await listSubscriptions(adminCookie, {
      schoolId: fixture.schoolB.school.id,
    }).expect(200);
    expect(bySchool.body.items.map((item: { id: string }) => item.id)).toEqual([otherSchool.id]);

    const byCourse = await listSubscriptions(adminCookie, { courseId: otherCourse.id }).expect(200);
    expect(byCourse.body.items).toHaveLength(1);
    expect(byCourse.body.items[0].courseId).toBe(otherCourse.id);

    const pageOne = await listSubscriptions(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      courseId: course.id,
      page: 1,
      limit: 2,
    }).expect(200);
    expect(pageOne.body.total).toBe(3);
    expect(pageOne.body.items.map((item: { id: string }) => item.id)).toEqual([
      upcoming.id,
      active.id,
    ]);
    expect(pageOne.body.page).toBe(1);
    expect(pageOne.body.limit).toBe(2);
    const pageTwo = await listSubscriptions(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      courseId: course.id,
      page: 2,
      limit: 2,
    }).expect(200);
    expect(pageTwo.body.items.map((item: { id: string }) => item.id)).toEqual([expired.id]);
  });

  it('gets subscriptions, patches allowed fields, and enforces the active delivery cap', async () => {
    const course = await createActiveCourse();
    const subscription = await grant(
      course.id,
      { endDate: addDateDays(today, 10) },
      fixture.schoolA.school.id,
      2,
    );
    await createActiveDelivery(course.id);
    await createActiveDelivery(course.id);

    const fetched = await getSubscription(adminCookie, subscription.id).expect(200);
    expect(fetched.body.activeDeliveries).toBe(2);
    expect(fetched.body.id).toBe(subscription.id);
    expectError(await getSubscription(adminCookie, randomUUID()), 404, 'SUBSCRIPTION_NOT_FOUND');

    const patched = await patchSubscription(adminCookie, subscription.id, {
      endDate: addDateDays(today, 11),
      maxDeliveries: 2,
    }).expect(200);
    expect(patched.body.endDate).toBe(addDateDays(today, 11));
    expect(patched.body.maxDeliveries).toBe(2);
    expect(patched.body.activeDeliveries).toBe(2);

    expectError(
      await patchSubscription(adminCookie, subscription.id, { maxDeliveries: 1 }),
      409,
      'DELIVERY_CAP_BELOW_ACTIVE',
    );
    await patchSubscription(adminCookie, subscription.id, {
      maxDeliveries: 2,
      startDate: today,
    }).expect(400);
    expectError(
      await patchSubscription(adminCookie, subscription.id, { endDate: null }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await patchSubscription(adminCookie, subscription.id, { maxDeliveries: null }),
      400,
      'VALIDATION_ERROR',
    );
    await patchSubscription(adminCookie, subscription.id, {}).expect(400);
    await patchSubscription(adminCookie, subscription.id, {
      unexpected: true,
    }).expect(400);
  });

  it('revokes started, future, and already-ended subscriptions correctly', async () => {
    const startedCourse = await createActiveCourse();
    const started = await grant(startedCourse.id, {
      startDate: addDateDays(today, -2),
      endDate: addDateDays(today, 5),
    });
    await revokeSubscription(adminCookie, started.id).expect(204);
    const ended = await getSubscription(adminCookie, started.id).expect(200);
    expect(ended.body.endDate).toBe(addDateDays(today, -1));
    expect(ended.body.status).toBe('EXPIRED');

    const futureCourse = await createActiveCourse();
    const future = await grant(futureCourse.id, {
      startDate: addDateDays(today, 2),
      endDate: addDateDays(today, 5),
    });
    await revokeSubscription(adminCookie, future.id).expect(204);
    expectError(await getSubscription(adminCookie, future.id), 404, 'SUBSCRIPTION_NOT_FOUND');

    const endedCourse = await createActiveCourse();
    const alreadyEnded = await grant(endedCourse.id, {
      startDate: addDateDays(today, -10),
      endDate: addDateDays(today, -5),
    });
    expectError(
      await revokeSubscription(adminCookie, alreadyEnded.id),
      409,
      'SUBSCRIPTION_ALREADY_ENDED',
    );
  });

  it('renews with defaults and explicit dates, rejects overlaps, and ignores retention windows', async () => {
    const course = await createActiveCourse();
    const original = await grant(
      course.id,
      { startDate: addDateDays(today, -5), endDate: addDateDays(today, -1) },
      fixture.schoolA.school.id,
      4,
    );
    const defaultRenewal = await renewSubscription(adminCookie, original.id, {
      endDate: addDateDays(today, 20),
    }).expect(201);
    expectError(
      await renewSubscription(adminCookie, original.id, {
        startDate: null,
        endDate: addDateDays(today, 20),
      }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(
      await renewSubscription(adminCookie, original.id, {
        maxDeliveries: null,
        endDate: addDateDays(today, 20),
      }),
      400,
      'VALIDATION_ERROR',
    );
    expect(defaultRenewal.body.startDate).toBe(today);
    expect(defaultRenewal.body.maxDeliveries).toBe(4);
    expect(defaultRenewal.body.retainedUntil).toBe(calculateRetainedUntil(addDateDays(today, 20)));
    expect(defaultRenewal.body.retainedUntil > original.retainedUntil).toBe(true);
    expect(defaultRenewal.body.id).not.toBe(original.id);

    const explicitCourse = await createActiveCourse();
    const explicitSource = await grant(explicitCourse.id, {
      startDate: addDateDays(today, -5),
      endDate: addDateDays(today, -1),
    });
    const explicit = await renewSubscription(adminCookie, explicitSource.id, {
      startDate: addDateDays(today, 10),
      endDate: addDateDays(today, 20),
      maxDeliveries: 8,
    }).expect(201);
    expect(explicit.body.startDate).toBe(addDateDays(today, 10));
    expect(explicit.body.maxDeliveries).toBe(8);

    const overlapCourse = await createActiveCourse();
    const source = await grant(overlapCourse.id, {
      startDate: today,
      endDate: addDateDays(today, 2),
    });
    await grant(overlapCourse.id, {
      startDate: addDateDays(today, 4),
      endDate: addDateDays(today, 8),
    });
    expectError(
      await renewSubscription(adminCookie, source.id, { endDate: addDateDays(today, 6) }),
      409,
      'SUBSCRIPTION_OVERLAP',
    );

    const oldCourse = await createActiveCourse();
    const expiredLongAgo = await grant(oldCourse.id, {
      startDate: '2020-01-01',
      endDate: '2020-01-31',
    });
    const oldRenewal = await renewSubscription(adminCookie, expiredLongAgo.id, {
      endDate: '2020-03-01',
    }).expect(201);
    expect(oldRenewal.body.startDate).toBe('2020-02-01');
    expect(oldRenewal.body.status).toBe('EXPIRED');
  });

  it('requires authentication and denies teachers and students on every route', async () => {
    const course = await createActiveCourse();
    const subscription = await grant(course.id);
    const missingCookie = '';

    const routes = [
      (cookie: string) =>
        request(app.getHttpServer())
          .post('/api/v1/subscriptions')
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({
            schoolId: fixture.schoolA.school.id,
            courseId: course.id,
            startDate: today,
            endDate: addDateDays(today, 1),
            maxDeliveries: 2,
          }),
      (cookie: string) => listSubscriptions(cookie),
      (cookie: string) => getSubscription(cookie, subscription.id),
      (cookie: string) => patchSubscription(cookie, subscription.id, { maxDeliveries: 3 }),
      (cookie: string) => revokeSubscription(cookie, subscription.id),
      (cookie: string) =>
        renewSubscription(cookie, subscription.id, { endDate: addDateDays(today, 2) }),
    ];
    for (const route of routes) {
      await route(missingCookie).expect(401);
      await route(teacherCookie).expect(403);
      await route(studentCookie).expect(403);
    }
  });
});
