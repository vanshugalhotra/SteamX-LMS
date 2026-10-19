import type { PrismaService } from '../../../src/prisma/prisma.service.js';

/**
 * Deletes test-created users (and their profiles), class sections, and schools,
 * then empties the tracking arrays so the next test starts clean.
 */
export async function cleanupFixtures(
  prisma: PrismaService,
  userIds: string[],
  schoolIds: string[],
  classSectionIds: string[] = [],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (userIds.length > 0) {
      await tx.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (classSectionIds.length > 0) {
      await tx.classSection.deleteMany({ where: { id: { in: classSectionIds } } });
    }
    if (schoolIds.length > 0) {
      await tx.school.deleteMany({ where: { id: { in: schoolIds } } });
    }
  });

  userIds.length = 0;
  classSectionIds.length = 0;
  schoolIds.length = 0;
}
