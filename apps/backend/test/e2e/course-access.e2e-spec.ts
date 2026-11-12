import { Controller, Get, INestApplication, Module, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { CurrentAuth } from '../../src/auth/decorators/current-auth.decorator.js';
import { AuthenticatedOnly } from '../../src/auth/decorators/authenticated-only.decorator.js';
import type { AuthContext } from '../../src/auth/types/auth-context.js';
import type { Env } from '../../src/config/env.schema.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { CourseAccessService } from '../../src/subscriptions/course-access.service.js';
import { SubscriptionsModule } from '../../src/subscriptions/subscriptions.module.js';
import { addDateDays } from '../../src/subscriptions/subscription-rules.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';
import { expectError } from '../support/expect-error.js';

@Controller('_test/course-access')
class CourseAccessTestController {
  constructor(private readonly courseAccess: CourseAccessService) {}

  @Get(':courseId')
  @AuthenticatedOnly()
  async check(
    @CurrentAuth() actor: AuthContext,
    @Param('courseId') courseId: string,
  ): Promise<{ allowed: true }> {
    await this.courseAccess.assertCourseAccess(actor, actor.schoolId ?? '', courseId);
    return { allowed: true };
  }
}

@Module({
  imports: [AppModule, SubscriptionsModule],
  controllers: [CourseAccessTestController],
})
class CourseAccessTestModule {}

describe('Course access endpoint (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let teacherACookie: string;
  let teacherBCookie: string;
  let today: string;
  const createdCourseIds: string[] = [];

  beforeAll(async () => {
    app = (await createTestApp(CourseAccessTestModule)) as INestApplication<App>;
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Course access e2e tests require a configured CORS_ORIGINS entry.');
    }

    fixture = await createTwoSchoolFixture(prisma);
    [adminCookie, teacherACookie, teacherBCookie, today] = await Promise.all([
      loginAsCookie(app, fixture.admin),
      loginAsCookie(app, fixture.schoolA.teacher),
      loginAsCookie(app, fixture.schoolB.teacher),
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

  async function createCourse(): Promise<string> {
    const course = await prisma.course.create({
      data: { title: `Course access e2e ${randomUUID()}`, status: 'ACTIVE' },
      select: { id: true },
    });
    createdCourseIds.push(course.id);
    return course.id;
  }

  async function createSubscription(
    schoolId: string,
    courseId: string,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO subscriptions
        (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
      VALUES
        (${id}::uuid, ${schoolId}::uuid, ${courseId}::uuid,
         ${startDate}::date, ${endDate}::date, 2, now())
    `;
    return id;
  }

  function checkCourseAccess(cookie: string, courseId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/_test/course-access/${courseId}`)
      .set('Cookie', cookie);
  }

  function renewSubscription(id: string, endDate: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ endDate });
  }

  it('enforces access per authenticated school and allows platform staff or a renewed term', async () => {
    const [yesterday] = await prisma.$queryRaw<{ yesterday: string }[]>`
      SELECT (business_today() - 1)::text AS yesterday
    `;
    if (!yesterday) {
      throw new Error('business_today() did not return a date');
    }
    const fiveDaysFromNow = addDateDays(today, 5);
    const courseId = await createCourse();
    const expiredId = await createSubscription(
      fixture.schoolA.school.id,
      courseId,
      yesterday.yesterday,
      yesterday.yesterday,
    );
    const sourceBeforeRenewal = await prisma.subscription.findUniqueOrThrow({
      where: { id: expiredId },
    });
    const deliveryCount = await prisma.delivery.count();

    expectError(await checkCourseAccess(teacherACookie, courseId), 403, 'SUBSCRIPTION_EXPIRED');
    await checkCourseAccess(adminCookie, courseId).expect(200);
    expectError(await checkCourseAccess(teacherBCookie, courseId), 403, 'SUBSCRIPTION_EXPIRED');

    await renewSubscription(expiredId, fiveDaysFromNow).expect(201);
    await checkCourseAccess(teacherACookie, courseId).expect(200);

    const sourceAfterRenewal = await prisma.subscription.findUniqueOrThrow({
      where: { id: expiredId },
    });
    expect(sourceAfterRenewal).toMatchObject({
      startDate: sourceBeforeRenewal.startDate,
      endDate: sourceBeforeRenewal.endDate,
      maxDeliveries: sourceBeforeRenewal.maxDeliveries,
    });
    expect(
      await prisma.subscription.count({
        where: { schoolId: fixture.schoolA.school.id, courseId },
      }),
    ).toBe(2);
    expect(await prisma.delivery.count()).toBe(deliveryCount);
  });
});
