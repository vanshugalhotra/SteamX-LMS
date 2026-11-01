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
  UserStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import {
  createTestTeacher,
  createTwoSchoolFixture,
  TENANCY_TEST_PASSWORD,
  type TestUserFixture,
  type TwoSchoolFixture,
} from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';

describe('Delivery teacher endpoints (e2e)', () => {
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
  let studentCookie: string;
  let today: string;
  let courseId: string;
  let deliverySequence = 0;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Delivery teacher e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Delivery teacher e2e tests require a configured CORS_ORIGINS entry.');
    }

    fixture = await createTwoSchoolFixture(prisma);
    const passwordHash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);
    peerTeacher = await prisma.$transaction((tx) =>
      createTestTeacher(tx, fixture.schoolA.school.id, passwordHash, 'Delivery Peer Teacher'),
    );
    const course = await prisma.course.create({
      data: {
        title: `Delivery teacher e2e ${randomUUID()}`,
        status: ContentStatus.ACTIVE,
      },
      select: { id: true },
    });
    courseId = course.id;
    const [subscription] = await prisma.$queryRaw<{ today: string }[]>`
      SELECT business_today()::text AS today
    `;
    if (!subscription) {
      throw new Error('business_today() did not return a date');
    }
    today = subscription.today;
    await prisma.subscription.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        startDate: new Date(`${today}T00:00:00.000Z`),
        endDate: new Date('2099-12-31T00:00:00.000Z'),
        maxDeliveries: 50,
      },
    });

    [adminCookie, teacherCookie, peerTeacherCookie, studentCookie] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, peerTeacher),
      loginAsCookie(app, fixture.schoolA.student),
    ]);
  });

  afterAll(async () => {
    if (fixture) {
      const schoolIds = [fixture.schoolA.school.id, fixture.schoolB.school.id];
      await prisma.$transaction(async (tx) => {
        await tx.deliveryTeacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
        await tx.delivery.deleteMany({ where: { schoolId: { in: schoolIds } } });
        if (courseId) {
          await tx.subscription.deleteMany({ where: { courseId } });
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
        ],
        schoolIds,
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  async function createDelivery(status: DeliveryStatus = DeliveryStatus.ACTIVE): Promise<string> {
    deliverySequence += 1;
    const year = 2300 + deliverySequence;
    const delivery = await prisma.delivery.create({
      data: {
        schoolId: fixture.schoolA.school.id,
        courseId,
        classSectionId: fixture.schoolA.section.id,
        academicYear: `${year}-${String((deliverySequence + 1) % 100).padStart(2, '0')}`,
      },
      select: { id: true },
    });
    if (status === DeliveryStatus.INACTIVE) {
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status },
      });
    }
    return delivery.id;
  }

  function assign(cookie: string, deliveryId: string, teacherId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/deliveries/${deliveryId}/teachers`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ teacherId });
  }

  function remove(cookie: string, deliveryId: string, teacherId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/deliveries/${deliveryId}/teachers/${teacherId}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function listTeachers(
    cookie: string,
    deliveryId: string,
    query: Record<string, string | number> = {},
  ) {
    return request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}/teachers`)
      .set('Cookie', cookie)
      .query(query);
  }

  function getDelivery(cookie: string, deliveryId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/deliveries/${deliveryId}`)
      .set('Cookie', cookie);
  }

  function listDeliveries(cookie: string) {
    return request(app.getHttpServer()).get('/api/v1/deliveries').set('Cookie', cookie);
  }

  it('assigns a teacher and immediately grants delivery read access', async () => {
    const deliveryId = await createDelivery();
    expectError(await getDelivery(teacherCookie, deliveryId), 404, 'NOT_FOUND');
    const beforeList = await listDeliveries(teacherCookie).expect(200);
    expect(beforeList.body.items.map((item: { id: string }) => item.id)).not.toContain(deliveryId);

    const response = await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(201);
    expect(response.body).toMatchObject({
      teacherId: fixture.schoolA.teacher.id,
      name: 'Tenancy School A Teacher',
      steamxId: fixture.schoolA.teacher.steamxId,
      assignedBy: { id: fixture.admin.id, name: 'Tenancy Test Admin' },
      removedAt: null,
      removedBy: null,
    });
    expect(response.body.id).toBeDefined();
    const assignments = await listTeachers(adminCookie, deliveryId).expect(200);
    expect(assignments.body).toMatchObject({
      total: 1,
      items: [{ id: response.body.id, teacherId: fixture.schoolA.teacher.id }],
    });

    await getDelivery(teacherCookie, deliveryId).expect(200);
    const afterList = await listDeliveries(teacherCookie).expect(200);
    expect(afterList.body.items.map((item: { id: string }) => item.id)).toContain(deliveryId);

    await remove(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(204);
    expectError(await getDelivery(teacherCookie, deliveryId), 404, 'NOT_FOUND');
    const removedList = await listDeliveries(teacherCookie).expect(200);
    expect(removedList.body.items.map((item: { id: string }) => item.id)).not.toContain(deliveryId);
    await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(201);
    await getDelivery(teacherCookie, deliveryId).expect(200);
  });

  it('hides foreign-school teachers and missing deliveries as not found', async () => {
    const deliveryId = await createDelivery();
    expectError(
      await assign(adminCookie, deliveryId, fixture.schoolB.teacher.id),
      404,
      'NOT_FOUND',
    );
    expectError(
      await assign(adminCookie, randomUUID(), fixture.schoolA.teacher.id),
      404,
      'NOT_FOUND',
    );
    expectError(await listTeachers(adminCookie, randomUUID()), 404, 'NOT_FOUND');
  });

  it('rejects inactive teachers and inactive deliveries', async () => {
    const deliveryId = await createDelivery();
    await prisma.user.update({
      where: { id: peerTeacher.id },
      data: { status: UserStatus.INACTIVE },
    });
    expectError(await assign(adminCookie, deliveryId, peerTeacher.id), 409, 'TEACHER_NOT_ACTIVE');
    await prisma.user.update({
      where: { id: peerTeacher.id },
      data: { status: UserStatus.ACTIVE },
    });

    const inactiveDeliveryId = await createDelivery(DeliveryStatus.INACTIVE);
    expectError(
      await assign(adminCookie, inactiveDeliveryId, fixture.schoolA.teacher.id),
      409,
      'DELIVERY_NOT_ACTIVE',
    );
  });

  it('rejects duplicate assignments and serializes concurrent duplicate requests', async () => {
    const deliveryId = await createDelivery();
    await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(201);
    expectError(
      await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id),
      409,
      'TEACHER_ALREADY_ASSIGNED',
    );

    const racingDeliveryId = await createDelivery();
    const responses = await Promise.all([
      assign(adminCookie, racingDeliveryId, fixture.schoolA.teacher.id),
      assign(adminCookie, racingDeliveryId, fixture.schoolA.teacher.id),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409);
    expectError(conflict!, 409, 'TEACHER_ALREADY_ASSIGNED');
  });

  it('removes an assignment, lists removed history, and creates a new row when re-added', async () => {
    const deliveryId = await createDelivery();
    const assigned = await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(201);
    await remove(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(204);
    expectError(
      await remove(adminCookie, deliveryId, fixture.schoolA.teacher.id),
      404,
      'TEACHER_NOT_ASSIGNED',
    );
    expect((await listTeachers(adminCookie, deliveryId).expect(200)).body.total).toBe(0);

    const history = await listTeachers(adminCookie, deliveryId, { includeRemoved: 'true' }).expect(
      200,
    );
    expect(history.body).toMatchObject({
      total: 1,
      items: [
        {
          id: assigned.body.id,
          removedBy: { id: fixture.admin.id, name: 'Tenancy Test Admin' },
        },
      ],
    });
    expect(history.body.items[0].removedAt).toBeTruthy();

    const reassigned = await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(
      201,
    );
    expect(reassigned.body.id).not.toBe(assigned.body.id);
    await getDelivery(teacherCookie, deliveryId).expect(200);
    const fullHistory = await listTeachers(adminCookie, deliveryId, {
      includeRemoved: 'true',
    }).expect(200);
    expect(fullHistory.body.total).toBe(2);
    expect(
      fullHistory.body.items.filter((item: { removedAt: Date | null }) => !item.removedAt),
    ).toHaveLength(1);
  });

  it('allows removal from an inactive delivery and does not affect another teacher stint', async () => {
    const deliveryId = await createDelivery();
    await assign(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(201);
    await assign(adminCookie, deliveryId, peerTeacher.id).expect(201);

    await remove(adminCookie, deliveryId, fixture.schoolA.teacher.id).expect(204);
    expectError(await getDelivery(teacherCookie, deliveryId), 404, 'NOT_FOUND');
    expect(
      (await listDeliveries(teacherCookie).expect(200)).body.items.map(
        (item: { id: string }) => item.id,
      ),
    ).not.toContain(deliveryId);
    await getDelivery(peerTeacherCookie, deliveryId).expect(200);
    expect(
      (await listDeliveries(peerTeacherCookie).expect(200)).body.items.map(
        (item: { id: string }) => item.id,
      ),
    ).toContain(deliveryId);

    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.INACTIVE },
    });
    await remove(adminCookie, deliveryId, peerTeacher.id).expect(204);
    expectError(await getDelivery(peerTeacherCookie, deliveryId), 404, 'NOT_FOUND');
  });

  it('denies teachers, students, and unauthenticated callers on all three routes', async () => {
    const deliveryId = await createDelivery();
    const teacherId = fixture.schoolA.teacher.id;
    for (const cookie of [teacherCookie, studentCookie]) {
      expectError(await listTeachers(cookie, deliveryId), 403, 'PERMISSION_REQUIRED');
      expectError(await assign(cookie, deliveryId, teacherId), 403, 'PERMISSION_REQUIRED');
      expectError(await remove(cookie, deliveryId, teacherId), 403, 'PERMISSION_REQUIRED');
    }

    expectError(
      await request(app.getHttpServer()).get(`/api/v1/deliveries/${deliveryId}/teachers`),
      401,
      'AUTHENTICATION_FAILED',
    );
    expectError(
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/teachers`)
        .set('Origin', origin)
        .send({ teacherId }),
      401,
      'AUTHENTICATION_FAILED',
    );
    expectError(
      await request(app.getHttpServer())
        .delete(`/api/v1/deliveries/${deliveryId}/teachers/${teacherId}`)
        .set('Origin', origin),
      401,
      'AUTHENTICATION_FAILED',
    );
  });
});
