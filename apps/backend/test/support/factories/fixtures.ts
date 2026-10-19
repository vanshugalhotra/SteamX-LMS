import { randomUUID } from 'node:crypto';
import {
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '../../../src/generated/prisma/client.js';
import type { ClassSection, School } from '../../../src/generated/prisma/client.js';
import { PasswordService } from '../../../src/auth/services/password.service.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';

export const TENANCY_TEST_PASSWORD = 'Tenancy test password 2026!';

export type TestUserFixture = {
  id: string;
  steamxId: string;
  schoolId: string | null;
  classSectionId: string | null;
  password: string;
};

export type TwoSchoolFixture = {
  admin: TestUserFixture;
  schoolA: {
    school: School;
    section: ClassSection;
    teacher: TestUserFixture;
    student: TestUserFixture;
  };
  schoolB: {
    school: School;
    section: ClassSection;
    teacher: TestUserFixture;
    student: TestUserFixture;
  };
};

type TestUserOptions = {
  userType: UserType;
  name: string;
  passwordHash: string;
  steamxId?: string;
  status?: UserStatus;
  schoolStatus?: SchoolStatus;
  mustChangePassword?: boolean;
};

export async function createTestUser(
  tx: Prisma.TransactionClient,
  options: TestUserOptions,
): Promise<{
  id: string;
  steamxId: string;
  schoolId: string | null;
  classSectionId: string | null;
}> {
  const roleKey =
    options.userType === UserType.PLATFORM_STAFF
      ? 'admin'
      : options.userType === UserType.STUDENT
        ? 'student'
        : 'teacher';
  const role = await tx.role.findUniqueOrThrow({
    where: { key: roleKey },
    select: { id: true },
  });
  const school =
    options.userType === UserType.PLATFORM_STAFF
      ? null
      : await tx.school.create({
          data: {
            code: `TST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
            name: 'Test School',
            city: 'Test City',
            state: 'Test State',
            postalCode: '00000',
            country: 'Test Country',
            status: options.schoolStatus ?? SchoolStatus.ACTIVE,
          },
          select: { id: true },
        });
  const classSection =
    options.userType === UserType.STUDENT && school
      ? await tx.classSection.create({
          data: {
            schoolId: school.id,
            className: `Class ${randomUUID().slice(0, 8)}`,
          },
          select: { id: true },
        })
      : null;
  const steamxId =
    options.steamxId ?? `TST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const user = await tx.user.create({
    data: {
      steamxId,
      name: options.name,
      passwordHash: options.passwordHash,
      roleId: role.id,
      userType: options.userType,
      schoolId: school?.id ?? null,
      status: options.status ?? UserStatus.ACTIVE,
      mustChangePassword: options.mustChangePassword ?? false,
    },
    select: { id: true },
  });

  if (options.userType === UserType.STUDENT && school && classSection) {
    await tx.studentProfile.create({
      data: {
        userId: user.id,
        schoolId: school.id,
        classSectionId: classSection.id,
      },
    });
  } else if (options.userType === UserType.SCHOOL_STAFF && school) {
    await tx.teacherProfile.create({
      data: { userId: user.id, schoolId: school.id },
    });
  }

  return {
    id: user.id,
    steamxId,
    schoolId: school?.id ?? null,
    classSectionId: classSection?.id ?? null,
  };
}

export async function createTestSchool(
  tx: Prisma.TransactionClient,
  name = 'Test School',
): Promise<School> {
  return tx.school.create({
    data: {
      code: `TST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      name,
      city: 'Test City',
      state: 'Test State',
      postalCode: '00000',
      country: 'Test Country',
    },
  });
}

export async function createTestClassSection(
  tx: Prisma.TransactionClient,
  schoolId: string,
  className = `Class ${randomUUID().slice(0, 8)}`,
): Promise<ClassSection> {
  return tx.classSection.create({
    data: { schoolId, className },
  });
}

async function createTestSchoolUser(
  tx: Prisma.TransactionClient,
  options: {
    roleKey: 'teacher' | 'student';
    userType: typeof UserType.SCHOOL_STAFF | typeof UserType.STUDENT;
    schoolId: string;
    name: string;
    passwordHash: string;
  },
): Promise<TestUserFixture> {
  const role = await tx.role.findUniqueOrThrow({
    where: { key: options.roleKey },
    select: { id: true },
  });
  const steamxId = `TST${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const user = await tx.user.create({
    data: {
      steamxId,
      name: options.name,
      passwordHash: options.passwordHash,
      roleId: role.id,
      userType: options.userType,
      schoolId: options.schoolId,
      mustChangePassword: false,
    },
    select: { id: true },
  });

  return {
    id: user.id,
    steamxId,
    schoolId: options.schoolId,
    classSectionId: null,
    password: TENANCY_TEST_PASSWORD,
  };
}

export async function createTestTeacher(
  tx: Prisma.TransactionClient,
  schoolId: string,
  passwordHash: string,
  name = 'Test Teacher',
): Promise<TestUserFixture> {
  const teacher = await createTestSchoolUser(tx, {
    roleKey: 'teacher',
    userType: UserType.SCHOOL_STAFF,
    schoolId,
    name,
    passwordHash,
  });
  await tx.teacherProfile.create({
    data: { userId: teacher.id, schoolId },
  });
  return teacher;
}

export async function createTestStudent(
  tx: Prisma.TransactionClient,
  schoolId: string,
  classSectionId: string,
  passwordHash: string,
  name = 'Test Student',
): Promise<TestUserFixture> {
  const student = await createTestSchoolUser(tx, {
    roleKey: 'student',
    userType: UserType.STUDENT,
    schoolId,
    name,
    passwordHash,
  });
  await tx.studentProfile.create({
    data: { userId: student.id, schoolId, classSectionId },
  });
  return { ...student, classSectionId };
}

export async function createTwoSchoolFixture(prisma: PrismaService): Promise<TwoSchoolFixture> {
  const passwordHash = await new PasswordService().hash(TENANCY_TEST_PASSWORD);

  return prisma.$transaction(async (tx) => {
    const admin = await createTestUser(tx, {
      userType: UserType.PLATFORM_STAFF,
      name: 'Tenancy Test Admin',
      passwordHash,
    });
    const schoolA = await createSchoolGroup(tx, passwordHash, 'Tenancy School A');
    const schoolB = await createSchoolGroup(tx, passwordHash, 'Tenancy School B');

    return { admin: { ...admin, password: TENANCY_TEST_PASSWORD }, schoolA, schoolB };
  });
}

async function createSchoolGroup(
  tx: Prisma.TransactionClient,
  passwordHash: string,
  schoolName: string,
): Promise<TwoSchoolFixture['schoolA']> {
  const school = await createTestSchool(tx, schoolName);
  const section = await createTestClassSection(tx, school.id);
  const teacher = await createTestTeacher(tx, school.id, passwordHash, `${schoolName} Teacher`);
  const student = await createTestStudent(
    tx,
    school.id,
    section.id,
    passwordHash,
    `${schoolName} Student`,
  );

  return { school, section, teacher, student };
}
