import { randomUUID } from 'node:crypto';
import { Prisma, SchoolStatus, UserStatus, UserType } from '../../src/generated/prisma/client.js';

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
