import { randomUUID } from 'node:crypto';
import { UserType } from '../../src/generated/prisma/client.js';
import type { User } from '../../src/generated/prisma/client.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestClassSection, createTestSchool, createTestUser } from './factories/fixtures.js';

const TEST_PASSWORD = 'Foundation test password 2026!';

export async function createSchool(prisma: PrismaService, name?: string) {
  return prisma.$transaction((tx) => createTestSchool(tx, name));
}

export async function createClassSection(
  prisma: PrismaService,
  schoolId: string,
  className?: string,
) {
  return prisma.$transaction((tx) => createTestClassSection(tx, schoolId, className));
}

export const createAdmin = (prisma: PrismaService) =>
  createRoleUser(prisma, UserType.PLATFORM_STAFF, 'Test Admin');

export const createTeacher = (prisma: PrismaService) =>
  createRoleUser(prisma, UserType.SCHOOL_STAFF, 'Test Teacher');

export const createStudent = (prisma: PrismaService) =>
  createRoleUser(prisma, UserType.STUDENT, 'Test Student');

async function createRoleUser(
  prisma: PrismaService,
  userType: UserType,
  name: string,
): Promise<{ user: User; password: string }> {
  const password = TEST_PASSWORD;
  const passwordHash = await new PasswordService().hash(password);
  const fixture = await prisma.$transaction((tx) =>
    createTestUser(tx, {
      userType,
      name,
      passwordHash,
      steamxId: `TST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: fixture.id } });
  return { user, password };
}
