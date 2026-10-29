import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserType } from '../../src/generated/prisma/client.js';
import type { AuthContext } from '../../src/auth/types/auth-context.js';
import { AppModule } from '../../src/app.module.js';
import { createTestSchool } from '../support/factories/fixtures.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { CourseAccessService } from '../../src/subscriptions/course-access.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';

describe('Course access service (database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseAccess: CourseAccessService;
  let subscriptions: SubscriptionsService;
  let schoolAId: string;
  let schoolBId: string;
  let courseAId: string;
  let courseBId: string;
  let today: string;
  let yesterday: string;
  let tomorrow: string;
  let inFiveDays: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    courseAccess = app.get(CourseAccessService);
    subscriptions = app.get(SubscriptionsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const [dateRow] = await prisma.$queryRaw<
      { today: string; yesterday: string; tomorrow: string; in_five_days: string }[]
    >`
      SELECT business_today()::text AS today,
             (business_today() - 1)::text AS yesterday,
             (business_today() + 1)::text AS tomorrow,
             (business_today() + 5)::text AS in_five_days
    `;
    if (!dateRow) {
      throw new Error('business_today() did not return a date');
    }
    ({ today, yesterday, tomorrow, in_five_days: inFiveDays } = dateRow);

    const schools = await prisma.$transaction(async (tx) => {
      const schoolA = await createTestSchool(tx, 'Course access school A');
      const schoolB = await createTestSchool(tx, 'Course access school B');
      const courseA = await tx.course.create({
        data: { title: `Course access A ${schoolA.id}`, status: 'ACTIVE' },
        select: { id: true },
      });
      const courseB = await tx.course.create({
        data: { title: `Course access B ${schoolA.id}`, status: 'ACTIVE' },
        select: { id: true },
      });
      return { schoolA, schoolB, courseA, courseB };
    });
    schoolAId = schools.schoolA.id;
    schoolBId = schools.schoolB.id;
    courseAId = schools.courseA.id;
    courseBId = schools.courseB.id;
  });

  afterEach(async () => {
    await prisma.subscription.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
    await prisma.course.deleteMany({ where: { id: { in: [courseAId, courseBId] } } });
    await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });
  });

  function actor(userType: UserType, schoolId: string | null): AuthContext {
    return {
      userId: '00000000-0000-4000-8000-000000000001',
      steamxId: 'TSTCOURSEACCESS',
      name: 'Course access test actor',
      roleKey: userType === UserType.PLATFORM_STAFF ? 'admin' : 'teacher',
      userType,
      schoolId,
      mustChangePassword: false,
    };
  }

  async function createSubscription(
    schoolId: string,
    courseId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO subscriptions
        (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
      VALUES
        (gen_random_uuid(), ${schoolId}::uuid, ${courseId}::uuid,
         ${startDate}::date, ${endDate}::date, 1, now())
    `;
  }

  async function expectExpired(schoolId: string, courseId: string): Promise<void> {
    let failure: unknown;
    try {
      await courseAccess.assertCourseAccess(
        actor(UserType.SCHOOL_STAFF, schoolId),
        schoolId,
        courseId,
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ForbiddenException);
    if (!(failure instanceof ForbiddenException)) {
      throw new Error('Expected course access to fail with a forbidden response.');
    }
    expect(failure.getStatus()).toBe(403);
    expect(failure.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_EXPIRED' });
  }

  it('hides resources from another school before checking that school subscription', async () => {
    await createSubscription(schoolBId, courseAId, yesterday, tomorrow);

    await expect(
      courseAccess.assertCourseAccess(
        actor(UserType.SCHOOL_STAFF, schoolAId),
        schoolBId,
        courseAId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows subscriptions starting and ending today, inclusively', async () => {
    await createSubscription(schoolAId, courseAId, today, tomorrow);
    await courseAccess.assertCourseAccess(
      actor(UserType.SCHOOL_STAFF, schoolAId),
      schoolAId,
      courseAId,
    );

    await createSubscription(schoolAId, courseBId, yesterday, today);
    await courseAccess.assertCourseAccess(
      actor(UserType.SCHOOL_STAFF, schoolAId),
      schoolAId,
      courseBId,
    );
  });

  it('denies ended, upcoming, missing, other-school, and other-course subscriptions', async () => {
    await createSubscription(schoolAId, courseAId, yesterday, yesterday);
    await createSubscription(schoolAId, courseBId, tomorrow, tomorrow);
    await expectExpired(schoolAId, courseAId);
    await expectExpired(schoolAId, courseBId);
    await expectExpired(schoolBId, courseAId);
    await expectExpired(schoolAId, '00000000-0000-4000-8000-000000000099');

    const unassignedCourse = await prisma.course.create({
      data: { title: `Unassigned course ${schoolAId}`, status: 'ACTIVE' },
      select: { id: true },
    });
    try {
      await expectExpired(schoolAId, unassignedCourse.id);
    } finally {
      await prisma.course.delete({ where: { id: unassignedCourse.id } });
    }
  });

  it('allows platform staff without querying a subscription', async () => {
    await courseAccess.assertCourseAccess(
      actor(UserType.PLATFORM_STAFF, null),
      schoolAId,
      courseAId,
    );
  });

  it('lists only valid school courses without duplicates', async () => {
    await createSubscription(schoolAId, courseAId, yesterday, yesterday);
    await createSubscription(schoolAId, courseAId, today, today);
    await createSubscription(schoolAId, courseAId, tomorrow, tomorrow);
    await createSubscription(schoolAId, courseBId, today, today);
    await createSubscription(schoolBId, courseAId, today, today);
    await createSubscription(schoolBId, courseBId, today, today);

    const ids = await courseAccess.getAccessibleCourseIds(actor(UserType.SCHOOL_STAFF, schoolAId));
    expect(ids.sort()).toEqual([courseAId, courseBId].sort());
    await expect(
      courseAccess.getAccessibleCourseIds(actor(UserType.SCHOOL_STAFF, schoolBId)),
    ).resolves.toEqual([courseAId, courseBId]);
  });

  it('requires an authenticated school for accessible course lists', async () => {
    await expect(
      courseAccess.getAccessibleCourseIds(actor(UserType.PLATFORM_STAFF, null)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restores access after renewal without changing the expired subscription or deliveries', async () => {
    await createSubscription(schoolAId, courseAId, yesterday, yesterday);
    const source = await prisma.subscription.findFirstOrThrow({
      where: { schoolId: schoolAId, courseId: courseAId },
    });
    const deliveryCount = await prisma.delivery.count();
    await expectExpired(schoolAId, courseAId);

    const renewal = await subscriptions.renew(actor(UserType.PLATFORM_STAFF, null), source.id, {
      endDate: inFiveDays,
    });

    expect(renewal.startDate).toBe(today);
    await courseAccess.assertCourseAccess(
      actor(UserType.SCHOOL_STAFF, schoolAId),
      schoolAId,
      courseAId,
    );
    const unchangedSource = await prisma.subscription.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(unchangedSource).toMatchObject({
      startDate: source.startDate,
      endDate: source.endDate,
      maxDeliveries: source.maxDeliveries,
    });
    expect(
      await prisma.subscription.count({ where: { schoolId: schoolAId, courseId: courseAId } }),
    ).toBe(2);
    expect(await prisma.delivery.count()).toBe(deliveryCount);
  });
});
