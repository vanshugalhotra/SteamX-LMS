/** Creates subscription, delivery, enrollment, release, and lesson-progress scenarios. */
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { CurriculumSeed } from './curriculum.js';
import type { IdentitySeed } from './identity.js';

export type DeliverySeedSummary = {
  subscriptions: number;
  deliveries: number;
  deliveryTeacherStints: number;
  enrollments: number;
  lessonReleases: number;
  skippedScenarios: string[];
};

const IDS = {
  coreNorth: '019a0000-0000-7000-8000-000000000511',
  coreSouth: '019a0000-0000-7000-8000-000000000512',
  expiredNorth: '019a0000-0000-7000-8000-000000000513',
  futureNorth: '019a0000-0000-7000-8000-000000000514',
  renewalOldSouth: '019a0000-0000-7000-8000-000000000515',
  renewalCurrentSouth: '019a0000-0000-7000-8000-000000000516',
  capNorth: '019a0000-0000-7000-8000-000000000517',
  coreNorthActiveDelivery: '019a0000-0000-7000-8000-000000000501',
  coreNorthInactiveDelivery: '019a0000-0000-7000-8000-000000000502',
  coreSouthDelivery: '019a0000-0000-7000-8000-000000000503',
  expiredNorthDelivery: '019a0000-0000-7000-8000-000000000504',
  capNorthDelivery: '019a0000-0000-7000-8000-000000000505',
  completedNorthDelivery: '019a0000-0000-7000-8000-000000000506',
  removedNorthDelivery: '019a0000-0000-7000-8000-000000000507',
  emptyOutlineNorthDelivery: '019a0000-0000-7000-8000-000000000508',
  removedTeacherStint: '019a0000-0000-7000-8000-000000000521',
  activeTeacherStint: '019a0000-0000-7000-8000-000000000522',
  endedTeacherStint: '019a0000-0000-7000-8000-000000000523',
  alexEnrollment: '019a0000-0000-7000-8000-000000000531',
  rileyEnrollment: '019a0000-0000-7000-8000-000000000532',
  drewCompletedEnrollment: '019a0000-0000-7000-8000-000000000533',
  caseyRemovedEnrollment: '019a0000-0000-7000-8000-000000000534',
  alexEmptyOutlineEnrollment: '019a0000-0000-7000-8000-000000000535',
  caseyExpiredEnrollment: '019a0000-0000-7000-8000-000000000536',
  taylorEnrollment: '019a0000-0000-7000-8000-000000000537',
} as const;

type BusinessDates = {
  today: Date;
  yesterday: Date;
  sixtyDaysAgo: Date;
  ninetyDaysAgo: Date;
  thirtyDaysAhead: Date;
  ninetyDaysAhead: Date;
  twoDaysAgoAt: Date;
  yesterdayAt: Date;
  todayAt: Date;
};

async function getBusinessDates(prisma: PrismaClient): Promise<BusinessDates> {
  const [dates] = await prisma.$queryRaw<BusinessDates[]>`
    SELECT
      business_today()::timestamp AT TIME ZONE 'UTC' AS today,
      (business_today() - 1)::timestamp AT TIME ZONE 'UTC' AS yesterday,
      (business_today() - 60)::timestamp AT TIME ZONE 'UTC' AS "sixtyDaysAgo",
      (business_today() - 90)::timestamp AT TIME ZONE 'UTC' AS "ninetyDaysAgo",
      (business_today() + 30)::timestamp AT TIME ZONE 'UTC' AS "thirtyDaysAhead",
      (business_today() + 90)::timestamp AT TIME ZONE 'UTC' AS "ninetyDaysAhead",
      (business_today() - 2)::timestamp AT TIME ZONE 'Asia/Kolkata' AS "twoDaysAgoAt",
      (business_today() - 1)::timestamp AT TIME ZONE 'Asia/Kolkata' AS "yesterdayAt",
      business_today()::timestamp AT TIME ZONE 'Asia/Kolkata' AS "todayAt"
  `;
  if (!dates) {
    throw new Error('PostgreSQL did not return business_today() date anchors.');
  }
  return dates;
}

/** Seeds learning scenarios using the same business date as the database triggers. */
export async function seedSubscriptionsAndDeliveries(
  prisma: PrismaClient,
  identity: IdentitySeed,
  curriculum: CurriculumSeed,
): Promise<DeliverySeedSummary> {
  const dates = await getBusinessDates(prisma);

  await prisma.subscription.createMany({
    data: [
      {
        id: IDS.coreNorth,
        schoolId: identity.north.id,
        courseId: curriculum.courses.active,
        startDate: dates.sixtyDaysAgo,
        endDate: dates.today,
        maxDeliveries: 4,
      },
      {
        id: IDS.coreSouth,
        schoolId: identity.south.id,
        courseId: curriculum.courses.active,
        startDate: dates.today,
        endDate: dates.ninetyDaysAhead,
        maxDeliveries: 3,
      },
      {
        id: IDS.expiredNorth,
        schoolId: identity.north.id,
        courseId: curriculum.courses.expired,
        startDate: dates.sixtyDaysAgo,
        endDate: dates.today,
        maxDeliveries: 2,
      },
      {
        id: IDS.futureNorth,
        schoolId: identity.north.id,
        courseId: curriculum.courses.future,
        startDate: dates.thirtyDaysAhead,
        endDate: dates.ninetyDaysAhead,
        maxDeliveries: 2,
      },
      {
        id: IDS.renewalOldSouth,
        schoolId: identity.south.id,
        courseId: curriculum.courses.renewal,
        startDate: dates.ninetyDaysAgo,
        endDate: dates.yesterday,
        maxDeliveries: 2,
      },
      {
        id: IDS.renewalCurrentSouth,
        schoolId: identity.south.id,
        courseId: curriculum.courses.renewal,
        startDate: dates.today,
        endDate: dates.ninetyDaysAhead,
        maxDeliveries: 2,
      },
      {
        id: IDS.capNorth,
        schoolId: identity.north.id,
        courseId: curriculum.courses.cap,
        startDate: dates.sixtyDaysAgo,
        endDate: dates.ninetyDaysAhead,
        maxDeliveries: 1,
      },
    ],
  });

  await prisma.delivery.create({
    data: {
      id: IDS.coreNorthActiveDelivery,
      schoolId: identity.north.id,
      courseId: curriculum.courses.active,
      classSectionId: identity.north.sections.grade5Blue,
      academicYear: '2026-27',
      status: 'ACTIVE',
    },
  });
  await prisma.delivery.create({
    data: {
      id: IDS.coreNorthInactiveDelivery,
      schoolId: identity.north.id,
      courseId: curriculum.courses.active,
      classSectionId: identity.north.sections.grade5Green,
      academicYear: '2026-27',
      status: 'INACTIVE',
    },
  });
  await prisma.delivery.create({
    data: {
      id: IDS.coreSouthDelivery,
      schoolId: identity.south.id,
      courseId: curriculum.courses.active,
      classSectionId: identity.south.sections.grade5Blue,
      academicYear: '2026-27',
      status: 'ACTIVE',
    },
  });
  await prisma.delivery.create({
    data: {
      id: IDS.capNorthDelivery,
      schoolId: identity.north.id,
      courseId: curriculum.courses.cap,
      classSectionId: identity.north.sections.grade6All,
      academicYear: '2026-27',
      status: 'ACTIVE',
    },
  });
  await prisma.delivery.createMany({
    data: [
      {
        id: IDS.completedNorthDelivery,
        schoolId: identity.north.id,
        courseId: curriculum.courses.active,
        classSectionId: identity.north.sections.grade5Green,
        academicYear: '2025-26',
        status: 'ACTIVE',
      },
      {
        id: IDS.removedNorthDelivery,
        schoolId: identity.north.id,
        courseId: curriculum.courses.active,
        classSectionId: identity.north.sections.grade6All,
        academicYear: '2025-26',
        status: 'ACTIVE',
      },
      {
        id: IDS.emptyOutlineNorthDelivery,
        schoolId: identity.north.id,
        courseId: curriculum.courses.active,
        classSectionId: identity.north.sections.grade5Blue,
        academicYear: '2025-26',
        status: 'ACTIVE',
      },
    ],
  });

  const skippedScenarios: string[] = [];
  let expiredDeliveryCreated = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.delivery.create({
        data: {
          id: IDS.expiredNorthDelivery,
          schoolId: identity.north.id,
          courseId: curriculum.courses.expired,
          classSectionId: identity.north.sections.grade6All,
          academicYear: '2026-27',
          status: 'ACTIVE',
        },
      });
      await tx.deliveryEnrollment.create({
        data: {
          id: IDS.caseyExpiredEnrollment,
          schoolId: identity.north.id,
          deliveryId: IDS.expiredNorthDelivery,
          studentId: identity.north.students.casey,
          enrolledById: identity.admin.id,
        },
      });
      await tx.subscription.update({
        where: { id: IDS.expiredNorth },
        data: { endDate: dates.yesterday },
      });
    });
    expiredDeliveryCreated = true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown database error';
    skippedScenarios.push(`Existing delivery after subscription expiry: ${reason}`);
    console.warn(`Skipped expired-subscription delivery scenario: ${reason}`);
    try {
      await prisma.subscription.update({
        where: { id: IDS.expiredNorth },
        data: { endDate: dates.yesterday },
      });
    } catch (expiryError) {
      const expiryReason =
        expiryError instanceof Error ? expiryError.message : 'Unknown database error';
      skippedScenarios.push(`Expired subscription status: ${expiryReason}`);
      console.warn(`Skipped expired-subscription status scenario: ${expiryReason}`);
    }
  }

  await prisma.deliveryTeacher.createMany({
    data: [
      {
        id: IDS.removedTeacherStint,
        schoolId: identity.north.id,
        deliveryId: IDS.coreNorthActiveDelivery,
        teacherId: identity.north.teachers.ava,
        assignedAt: dates.twoDaysAgoAt,
        assignedById: identity.admin.id,
        removedAt: dates.yesterdayAt,
        removedById: identity.admin.id,
      },
      {
        id: IDS.activeTeacherStint,
        schoolId: identity.north.id,
        deliveryId: IDS.coreNorthActiveDelivery,
        teacherId: identity.north.teachers.ava,
        assignedAt: dates.todayAt,
        assignedById: identity.admin.id,
      },
      {
        id: IDS.endedTeacherStint,
        schoolId: identity.north.id,
        deliveryId: IDS.coreNorthActiveDelivery,
        teacherId: identity.north.teachers.theo,
        assignedAt: dates.twoDaysAgoAt,
        assignedById: identity.admin.id,
        removedAt: dates.yesterdayAt,
        removedById: identity.admin.id,
      },
    ],
  });

  await prisma.deliveryEnrollment.createMany({
    data: [
      {
        id: IDS.alexEnrollment,
        schoolId: identity.north.id,
        deliveryId: IDS.coreNorthActiveDelivery,
        studentId: identity.north.students.alex,
        enrolledById: identity.admin.id,
      },
      {
        id: IDS.rileyEnrollment,
        schoolId: identity.north.id,
        deliveryId: IDS.coreNorthActiveDelivery,
        studentId: identity.north.students.riley,
        enrolledById: identity.admin.id,
      },
      {
        id: IDS.drewCompletedEnrollment,
        schoolId: identity.north.id,
        deliveryId: IDS.completedNorthDelivery,
        studentId: identity.north.students.drew,
        enrolledById: identity.admin.id,
      },
      {
        id: IDS.caseyRemovedEnrollment,
        schoolId: identity.north.id,
        deliveryId: IDS.removedNorthDelivery,
        studentId: identity.north.students.casey,
        enrolledById: identity.admin.id,
      },
      {
        id: IDS.alexEmptyOutlineEnrollment,
        schoolId: identity.north.id,
        deliveryId: IDS.emptyOutlineNorthDelivery,
        studentId: identity.north.students.alex,
        enrolledById: identity.admin.id,
      },
      {
        id: IDS.taylorEnrollment,
        schoolId: identity.south.id,
        deliveryId: IDS.coreSouthDelivery,
        studentId: identity.south.students.taylor,
        enrolledById: identity.admin.id,
      },
    ],
  });

  await prisma.$executeRaw`
    UPDATE delivery_enrollments
    SET status = 'COMPLETED'::enrollment_status,
        ended_at = GREATEST(enrolled_at, now())
    WHERE id = ${IDS.drewCompletedEnrollment}::uuid
  `;
  await prisma.$executeRaw`
    UPDATE delivery_enrollments
    SET status = 'REMOVED'::enrollment_status,
        ended_at = GREATEST(enrolled_at, now())
    WHERE id = ${IDS.caseyRemovedEnrollment}::uuid
  `;

  const releasedLessonIds = [
    curriculum.lesson,
    curriculum.learningLessons.activeStudent,
    curriculum.learningLessons.archivedAfterRelease,
  ];
  const learningDeliveryIds = [
    IDS.coreNorthActiveDelivery,
    IDS.coreSouthDelivery,
    IDS.completedNorthDelivery,
    IDS.removedNorthDelivery,
  ];
  await prisma.deliveryLessonRelease.createMany({
    data: learningDeliveryIds.flatMap((deliveryId) =>
      releasedLessonIds.map((lessonId) => ({
        schoolId: deliveryId === IDS.coreSouthDelivery ? identity.south.id : identity.north.id,
        deliveryId,
        courseId: curriculum.courses.active,
        lessonId,
        releasedById: identity.admin.id,
      })),
    ),
  });

  await prisma.lesson.update({
    where: { id: curriculum.learningLessons.archivedAfterRelease },
    data: { status: 'ARCHIVED' },
  });

  await prisma.lessonCompletion.createMany({
    data: [
      ...[curriculum.lesson, curriculum.learningLessons.archivedAfterRelease].map((lessonId) => ({
        schoolId: identity.north.id,
        deliveryId: IDS.coreNorthActiveDelivery,
        studentId: identity.north.students.alex,
        lessonId,
        courseId: curriculum.courses.active,
      })),
      {
        schoolId: identity.south.id,
        deliveryId: IDS.coreSouthDelivery,
        studentId: identity.south.students.taylor,
        lessonId: curriculum.lesson,
        courseId: curriculum.courses.active,
      },
    ],
  });

  return {
    subscriptions: 7,
    deliveries: 7 + Number(expiredDeliveryCreated),
    deliveryTeacherStints: 3,
    enrollments: 6 + Number(expiredDeliveryCreated),
    lessonReleases: learningDeliveryIds.length * releasedLessonIds.length,
    skippedScenarios,
  };
}
