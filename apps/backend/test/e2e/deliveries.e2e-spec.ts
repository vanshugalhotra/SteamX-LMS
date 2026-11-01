import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import type { Env } from '../../src/config/env.schema.js';
import {
  ContentStatus,
  DeliveryStatus,
  PrismaClient,
  SchoolStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { addDateDays } from '../../src/subscriptions/subscription-rules.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';

describe('Deliveries endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let teacherACookie: string;
  let teacherBCookie: string;
  let studentCookie: string;
  let today: string;
  const createdCourseIds: string[] = [];
  const extraSectionIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Deliveries e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Deliveries e2e tests require a configured CORS_ORIGINS entry.');
    }

    fixture = await createTwoSchoolFixture(prisma);
    [adminCookie, teacherACookie, teacherBCookie, studentCookie, today] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, fixture.schoolB.teacher),
      loginAsCookie(app, fixture.schoolA.student),
      getToday(),
    ]);
  });

  afterAll(async () => {
    if (fixture) {
      const schoolIds = [fixture.schoolA.school.id, fixture.schoolB.school.id];
      await prisma.$transaction(async (tx) => {
        await tx.deliveryTeacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
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
        [fixture.schoolA.section.id, fixture.schoolB.section.id, ...extraSectionIds],
      );
    }
    await app?.close();
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

  async function createCourse(status: ContentStatus = ContentStatus.ACTIVE): Promise<string> {
    const course = await prisma.course.create({
      data: { title: `Delivery course ${randomUUID()}`, status },
      select: { id: true },
    });
    createdCourseIds.push(course.id);
    return course.id;
  }

  async function createSubscription(
    schoolId: string,
    courseId: string,
    options: { startDate?: string; endDate?: string; maxDeliveries?: number } = {},
  ): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO subscriptions
        (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
      VALUES
        (${id}::uuid, ${schoolId}::uuid, ${courseId}::uuid,
         ${options.startDate ?? today}::date, ${options.endDate ?? addDateDays(today, 30)}::date,
         ${options.maxDeliveries ?? 5}, now())
    `;
    return id;
  }

  function createDelivery(
    cookie: string,
    options: {
      schoolId?: string;
      courseId: string;
      classSectionId?: string;
      academicYear: string;
    },
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        schoolId: options.schoolId ?? fixture.schoolA.school.id,
        courseId: options.courseId,
        classSectionId: options.classSectionId ?? fixture.schoolA.section.id,
        academicYear: options.academicYear,
      });
  }

  function listDeliveries(cookie: string, query: Record<string, string | number> = {}) {
    return request(app.getHttpServer())
      .get('/api/v1/deliveries')
      .set('Cookie', cookie)
      .query(query);
  }

  function getDelivery(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/v1/deliveries/${id}`).set('Cookie', cookie);
  }

  function updateDeliveryStatus(cookie: string, id: string, status: DeliveryStatus) {
    return request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${id}/status`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ status });
  }

  async function createDirectDelivery(
    schoolId: string,
    courseId: string,
    classSectionId: string,
    academicYear: string,
  ): Promise<{ id: string }> {
    return prisma.delivery.create({
      data: { schoolId, courseId, classSectionId, academicYear },
      select: { id: true },
    });
  }

  it('creates deliveries and enforces the active delivery cap on create and reactivation', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, courseId, { maxDeliveries: 2 });

    const first = await createDelivery(adminCookie, { courseId, academicYear: '2030-31' }).expect(
      201,
    );
    expect(first.body).toMatchObject({
      schoolId: fixture.schoolA.school.id,
      course: { id: courseId },
      classSection: {
        id: fixture.schoolA.section.id,
        className: fixture.schoolA.section.className,
        sectionName: fixture.schoolA.section.sectionName,
      },
      academicYear: '2030-31',
      status: DeliveryStatus.ACTIVE,
      displayName: `${first.body.course.title} - ${fixture.schoolA.section.className} ${fixture.schoolA.section.sectionName} - 2030-31`,
      subscriptionActive: true,
    });
    expect(first.body).not.toHaveProperty('courseId');
    expect(first.body).not.toHaveProperty('classSectionId');

    const second = await createDelivery(adminCookie, { courseId, academicYear: '2031-32' }).expect(
      201,
    );
    const atCap = await createDelivery(adminCookie, { courseId, academicYear: '2032-33' });
    expectError(atCap, 409, 'DELIVERY_LIMIT_REACHED');
    expect(atCap.body.message).toContain('2/2');

    await updateDeliveryStatus(adminCookie, first.body.id, DeliveryStatus.INACTIVE).expect(200);
    await createDelivery(adminCookie, { courseId, academicYear: '2032-33' }).expect(201);
    expectError(
      await updateDeliveryStatus(adminCookie, first.body.id, DeliveryStatus.ACTIVE),
      409,
      'DELIVERY_LIMIT_REACHED',
    );
    await updateDeliveryStatus(adminCookie, second.body.id, DeliveryStatus.ACTIVE).expect(200);
  });

  it('requires a current subscription for platform admins, including on reactivation, and renewals restore access', async () => {
    const expiredCourseId = await createCourse();
    const expiredSubscriptionId = await createSubscription(
      fixture.schoolA.school.id,
      expiredCourseId,
      { startDate: addDateDays(today, -10), endDate: addDateDays(today, -1) },
    );
    expectError(
      await createDelivery(adminCookie, { courseId: expiredCourseId, academicYear: '2030-31' }),
      403,
      'SUBSCRIPTION_EXPIRED',
    );

    const noSubscriptionCourseId = await createCourse();
    expectError(
      await createDelivery(adminCookie, {
        courseId: noSubscriptionCourseId,
        academicYear: '2030-31',
      }),
      403,
      'SUBSCRIPTION_EXPIRED',
    );

    const upcomingCourseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, upcomingCourseId, {
      startDate: addDateDays(today, 2),
    });
    expectError(
      await createDelivery(adminCookie, { courseId: upcomingCourseId, academicYear: '2030-31' }),
      403,
      'SUBSCRIPTION_EXPIRED',
    );

    const activeCourseId = await createCourse();
    const activeSubscriptionId = await createSubscription(
      fixture.schoolA.school.id,
      activeCourseId,
      { startDate: addDateDays(today, -10) },
    );
    const delivery = await createDelivery(adminCookie, {
      courseId: activeCourseId,
      academicYear: '2030-31',
    }).expect(201);
    await prisma.subscription.update({
      where: { id: activeSubscriptionId },
      data: { endDate: new Date(`${addDateDays(today, -1)}T00:00:00.000Z`) },
    });
    await updateDeliveryStatus(adminCookie, delivery.body.id, DeliveryStatus.INACTIVE).expect(200);
    expectError(
      await updateDeliveryStatus(adminCookie, delivery.body.id, DeliveryStatus.ACTIVE),
      403,
      'SUBSCRIPTION_EXPIRED',
    );

    const renewed = await request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${expiredSubscriptionId}/renew`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ endDate: addDateDays(today, 30) })
      .expect(201);
    expect(renewed.body.status).toBe('ACTIVE');
    await createDelivery(adminCookie, {
      courseId: expiredCourseId,
      academicYear: '2030-31',
    }).expect(201);
  });

  it('rejects duplicate delivery identity and inactive courses, but permits another academic year', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, courseId);
    await createDelivery(adminCookie, { courseId, academicYear: '2030-31' }).expect(201);
    expectError(
      await createDelivery(adminCookie, { courseId, academicYear: '2030-31' }),
      409,
      'DELIVERY_ALREADY_EXISTS',
    );
    await createDelivery(adminCookie, { courseId, academicYear: '2032' }).expect(400);
    await createDelivery(adminCookie, { courseId, academicYear: '2031-32' }).expect(201);
    expectError(
      await request(app.getHttpServer())
        .post('/api/v1/deliveries')
        .set('Origin', origin)
        .set('Cookie', adminCookie)
        .send({
          schoolId: fixture.schoolA.school.id,
          courseId,
          classSectionId: fixture.schoolA.section.id,
          academicYear: '2033-34',
          unknown: true,
        }),
      400,
      'VALIDATION_ERROR',
    );

    for (const status of [ContentStatus.DRAFT, ContentStatus.ARCHIVED]) {
      const inactiveCourseId = await createCourse(status);
      expectError(
        await createDelivery(adminCookie, {
          courseId: inactiveCourseId,
          academicYear: '2030-31',
        }),
        409,
        'COURSE_NOT_ACTIVE',
      );
    }
  });

  it('returns 404 for an unknown school and a section belonging to another school', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, courseId);
    expectError(
      await createDelivery(adminCookie, {
        schoolId: randomUUID(),
        courseId,
        academicYear: '2030-31',
      }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await createDelivery(adminCookie, {
        courseId: randomUUID(),
        academicYear: '2030-31',
      }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await createDelivery(adminCookie, {
        schoolId: fixture.schoolA.school.id,
        classSectionId: fixture.schoolB.section.id,
        courseId,
        academicYear: '2030-31',
      }),
      404,
      'NOT_FOUND',
    );
  });

  it('rejects delivery creation for an inactive school', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolB.school.id, courseId);
    await prisma.school.update({
      where: { id: fixture.schoolB.school.id },
      data: { status: SchoolStatus.INACTIVE },
    });
    try {
      expectError(
        await createDelivery(adminCookie, {
          schoolId: fixture.schoolB.school.id,
          classSectionId: fixture.schoolB.section.id,
          courseId,
          academicYear: '2030-31',
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
  });

  it('filters and paginates results with subscription activity derived per school-course pair', async () => {
    const section = await prisma.classSection.create({
      data: { schoolId: fixture.schoolA.school.id, className: `Delivery filter ${randomUUID()}` },
      select: { id: true },
    });
    extraSectionIds.push(section.id);
    const activeCourseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, activeCourseId);
    const first = await createDelivery(adminCookie, {
      courseId: activeCourseId,
      classSectionId: section.id,
      academicYear: '2030-31',
    }).expect(201);
    const second = await createDelivery(adminCookie, {
      courseId: activeCourseId,
      classSectionId: section.id,
      academicYear: '2031-32',
    }).expect(201);
    await updateDeliveryStatus(adminCookie, second.body.id, DeliveryStatus.INACTIVE).expect(200);

    const expiredCourseId = await createCourse();
    const expiredSubscriptionId = await createSubscription(
      fixture.schoolA.school.id,
      expiredCourseId,
      { startDate: addDateDays(today, -10) },
    );
    const expiredDelivery = await createDelivery(adminCookie, {
      courseId: expiredCourseId,
      classSectionId: section.id,
      academicYear: '2032-33',
    }).expect(201);
    await prisma.subscription.update({
      where: { id: expiredSubscriptionId },
      data: { endDate: new Date(`${addDateDays(today, -1)}T00:00:00.000Z`) },
    });

    const pageOne = await listDeliveries(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      classSectionId: section.id,
      page: 1,
      limit: 2,
    }).expect(200);
    expect(pageOne.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(pageOne.body.items).toHaveLength(2);
    const pageTwo = await listDeliveries(adminCookie, {
      schoolId: fixture.schoolA.school.id,
      classSectionId: section.id,
      page: 2,
      limit: 2,
    }).expect(200);
    expect(pageTwo.body.items).toHaveLength(1);
    const all = [...pageOne.body.items, ...pageTwo.body.items] as {
      id: string;
      subscriptionActive: boolean;
      createdAt: string;
    }[];
    expect(Date.parse(all[0]!.createdAt)).toBeGreaterThanOrEqual(Date.parse(all[1]!.createdAt));
    expect(all.find(({ id }) => id === first.body.id)?.subscriptionActive).toBe(true);
    expect(all.find(({ id }) => id === second.body.id)?.subscriptionActive).toBe(true);
    expect(all.find(({ id }) => id === expiredDelivery.body.id)?.subscriptionActive).toBe(false);

    expect(
      (await listDeliveries(adminCookie, { courseId: activeCourseId })).body.items.map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual(expect.arrayContaining([first.body.id, second.body.id]));
    expect(
      (
        await listDeliveries(adminCookie, { classSectionId: section.id, academicYear: '2030-31' })
      ).body.items.map((item: { id: string }) => item.id),
    ).toEqual([first.body.id]);
    expect(
      (
        await listDeliveries(adminCookie, { classSectionId: section.id, status: 'INACTIVE' })
      ).body.items.map((item: { id: string }) => item.id),
    ).toEqual([second.body.id]);
  });

  it('limits teacher visibility to active assignments and denies cross-school access', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, courseId);
    await createSubscription(fixture.schoolB.school.id, courseId);
    const assigned = await createDirectDelivery(
      fixture.schoolA.school.id,
      courseId,
      fixture.schoolA.section.id,
      '2030-31',
    );
    const removed = await createDirectDelivery(
      fixture.schoolA.school.id,
      courseId,
      fixture.schoolA.section.id,
      '2031-32',
    );
    const otherSchool = await createDirectDelivery(
      fixture.schoolB.school.id,
      courseId,
      fixture.schoolB.section.id,
      '2030-31',
    );
    await prisma.deliveryTeacher.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId: assigned.id,
        teacherId: fixture.schoolA.teacher.id,
      },
    });
    await prisma.deliveryTeacher.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        deliveryId: removed.id,
        teacherId: fixture.schoolA.teacher.id,
        removedAt: new Date(),
      },
    });
    await prisma.deliveryTeacher.create({
      data: {
        schoolId: fixture.schoolB.school.id,
        deliveryId: otherSchool.id,
        teacherId: fixture.schoolB.teacher.id,
      },
    });

    const list = await listDeliveries(teacherACookie).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(assigned.id);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(removed.id);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(otherSchool.id);
    await getDelivery(teacherACookie, assigned.id).expect(200);
    expectError(await getDelivery(teacherACookie, removed.id), 404, 'NOT_FOUND');
    expectError(await getDelivery(teacherACookie, otherSchool.id), 404, 'NOT_FOUND');
    expectError(
      await listDeliveries(teacherBCookie, { schoolId: fixture.schoolA.school.id }),
      404,
      'NOT_FOUND',
    );
    expectError(await getDelivery(teacherBCookie, assigned.id), 404, 'NOT_FOUND');

    expectError(
      await createDelivery(teacherACookie, { courseId, academicYear: '2032-33' }),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(
      await updateDeliveryStatus(teacherACookie, assigned.id, DeliveryStatus.INACTIVE),
      403,
      'PERMISSION_REQUIRED',
    );
  });

  it('denies students on every delivery route and unauthenticated callers before authorization', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, courseId);
    const delivery = await createDelivery(adminCookie, {
      courseId,
      academicYear: '2030-31',
    }).expect(201);

    expectError(
      await createDelivery(studentCookie, { courseId, academicYear: '2031-32' }),
      403,
      'PERMISSION_REQUIRED',
    );
    expectError(await listDeliveries(studentCookie), 403, 'PERMISSION_REQUIRED');
    expectError(await getDelivery(studentCookie, delivery.body.id), 403, 'PERMISSION_REQUIRED');
    expectError(
      await updateDeliveryStatus(studentCookie, delivery.body.id, DeliveryStatus.INACTIVE),
      403,
      'PERMISSION_REQUIRED',
    );

    const anonymousPost = await request(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Origin', origin)
      .send({
        schoolId: fixture.schoolA.school.id,
        courseId,
        classSectionId: fixture.schoolA.section.id,
        academicYear: '2032-33',
      });
    expectError(anonymousPost, 401, 'AUTHENTICATION_FAILED');
    expectError(
      await request(app.getHttpServer()).get('/api/v1/deliveries'),
      401,
      'AUTHENTICATION_FAILED',
    );
    expectError(
      await request(app.getHttpServer()).get(`/api/v1/deliveries/${delivery.body.id}`),
      401,
      'AUTHENTICATION_FAILED',
    );
    const anonymousPatch = await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${delivery.body.id}/status`)
      .set('Origin', origin)
      .send({ status: DeliveryStatus.INACTIVE });
    expectError(anonymousPatch, 401, 'AUTHENTICATION_FAILED');
  });

  it('serializes competing creates for the last available delivery slot', async () => {
    const courseId = await createCourse();
    await createSubscription(fixture.schoolA.school.id, courseId, { maxDeliveries: 1 });
    const responses = await Promise.all([
      createDelivery(adminCookie, { courseId, academicYear: '2030-31' }),
      createDelivery(adminCookie, { courseId, academicYear: '2031-32' }),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict).toBeDefined();
    expectError(conflict!, 409, 'DELIVERY_LIMIT_REACHED');
  });
});
