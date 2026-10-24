import { BadRequestException } from '@nestjs/common';
import { SchoolStatus, UserStatus, UserType } from '../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import { API_ERROR } from '../common/errors/api-errors.js';
import { ActiveSchoolService } from '../common/tenancy/active-school.service.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PasswordService } from '../auth/services/password.service.js';
import { ClassSectionsService } from '../class-sections/class-sections.service.js';
import { ClassSectionsRepository } from '../class-sections/class-sections.repository.js';
import { SchoolsService } from '../schools/schools.service.js';
import { SteamxIdService } from './steamx-id/steamx-id.service.js';
import { UsersRepository, type UserDetailRecord } from './users.repository.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  // School staff cannot redirect account creation to another tenant.
  it('forces a school staff account into its own school', async () => {
    const setup = createService();

    const created = await setup.service.createTeacher(schoolActor, {
      name: 'Ada Lovelace',
      password: 'Strong-Password-987!',
    });

    expect(created.schoolId).toBe('school-1');
  });

  // Platform staff must explicitly choose the school for a new account.
  it('rejects platform staff account creation without a school', async () => {
    const { service } = createService();

    await expect(
      service.createTeacher(platformActor, {
        name: 'Ada Lovelace',
        password: 'Strong-Password-987!',
      }),
    ).rejects.toMatchObject({ response: API_ERROR.SCHOOL_REQUIRED });
  });

  // Inactive schools cannot receive new managed accounts.
  it('rejects account creation in an inactive school', async () => {
    const { service, prisma } = createService();
    prisma.school.findUnique.mockResolvedValue({
      id: 'school-1',
      code: 'GVS',
      status: SchoolStatus.INACTIVE,
    });

    await expect(
      service.createTeacher(platformActor, {
        name: 'Ada Lovelace',
        password: 'Strong-Password-987!',
        schoolId: 'school-1',
      }),
    ).rejects.toMatchObject({ response: API_ERROR.SCHOOL_INACTIVE });
  });

  // Seed role configuration must agree with the account type being created.
  it('rejects a teacher role configured for another user type', async () => {
    const { service, users } = createService();
    users.findRole.mockResolvedValue({ id: 3, userType: UserType.STUDENT });

    await expect(
      service.createTeacher(platformActor, {
        name: 'Ada Lovelace',
        password: 'Strong-Password-987!',
        schoolId: 'school-1',
      }),
    ).rejects.toMatchObject({ response: API_ERROR.ROLE_CONFIGURATION_ERROR });
  });

  // Student creation verifies section ownership before creating the account.
  it('rejects a student section that is not in the selected school', async () => {
    const { service } = createService();

    await expect(
      service.createStudent(platformActor, {
        name: 'Sam Student',
        password: 'Strong-Password-987!',
        schoolId: 'school-1',
        classSectionId: 'foreign-section',
      }),
    ).rejects.toMatchObject({ response: API_ERROR.NOT_FOUND });
  });

  // Empty and account-type-inapplicable updates are rejected before persistence.
  it.each([
    ['empty patch', UserType.SCHOOL_STAFF, {}],
    ['student email', UserType.STUDENT, { email: 'new@example.test' }],
    ['teacher guardian name', UserType.SCHOOL_STAFF, { guardianName: 'Guardian' }],
  ])('rejects a %s update', async (_caseName, userType, body) => {
    const { service } = createService({
      target: userRecord({ userType }),
    });

    await expect(service.update(platformActor, 'target-1', body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // Repeating a student's current section is an observable no-op.
  it('returns the unchanged student when the class section is unchanged', async () => {
    const student = userRecord({
      userType: UserType.STUDENT,
      studentProfile: { guardianName: null, classSectionId: 'section-1' },
    });
    const { service } = createService({ target: student });

    const result = await service.update(platformActor, 'target-1', {
      classSectionId: 'section-1',
    });

    expect(result.profile).toEqual({
      guardianName: null,
      classSectionId: 'section-1',
    });
  });

  // Users may not deactivate their own account through the administrative status route.
  it('rejects self-deactivation', async () => {
    const actor = { ...platformActor, userId: 'target-1' };
    const { service } = createService({ target: userRecord({ id: 'target-1' }) });

    await expect(
      service.updateStatus(actor, 'target-1', { status: UserStatus.INACTIVE }),
    ).rejects.toMatchObject({ response: API_ERROR.CANNOT_DEACTIVATE_SELF });
  });

  // School management endpoints cannot mutate a platform account.
  it('rejects updates to a platform-staff account', async () => {
    const { service } = createService({
      target: userRecord({ schoolId: null, userType: UserType.PLATFORM_STAFF }),
    });

    await expect(
      service.update(platformActor, 'target-1', { name: 'Changed Name' }),
    ).rejects.toMatchObject({ response: API_ERROR.USER_NOT_MANAGEABLE });
  });

  // Duplicate email failures map to a safe domain conflict instead of a raw Prisma error.
  it('maps duplicate email updates to the conflict API error', async () => {
    const { service, users } = createService();
    users.update.mockRejectedValue(
      Object.assign(new Error('internal unique index detail'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      }),
    );

    await expect(
      service.update(platformActor, 'target-1', { email: 'used@example.test' }),
    ).rejects.toMatchObject({ response: API_ERROR.CONFLICT });
  });
});

const platformActor: AuthContext = {
  userId: 'platform-1',
  steamxId: 'PLATFORM1',
  name: 'Platform Admin',
  roleKey: 'platform_admin',
  userType: UserType.PLATFORM_STAFF,
  schoolId: null,
  mustChangePassword: false,
};

const schoolActor: AuthContext = {
  ...platformActor,
  userId: 'school-admin-1',
  steamxId: 'GVSADMIN1',
  roleKey: 'school_admin',
  userType: UserType.SCHOOL_STAFF,
  schoolId: 'school-1',
};

function createService(options: { target?: UserDetailRecord } = {}) {
  const users = {
    findById: vi.fn().mockResolvedValue(options.target ?? userRecord()),
    findRole: vi.fn().mockResolvedValue({ id: 2, userType: UserType.SCHOOL_STAFF }),
    createTeacher: vi
      .fn()
      .mockImplementation(async (input: Partial<UserDetailRecord>) => userRecord(input)),
    createStudent: vi
      .fn()
      .mockImplementation(async (input: Partial<UserDetailRecord>) => userRecord(input)),
    update: vi.fn().mockResolvedValue(userRecord()),
    updateStatus: vi.fn().mockResolvedValue(userRecord()),
  };
  const prisma = {
    school: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'school-1',
        code: 'GVS',
        status: SchoolStatus.ACTIVE,
      }),
    },
  };
  const passwords = { hash: vi.fn().mockResolvedValue('hashed-password') };
  const steamxIds = new SteamxIdService();
  const logger = { setContext: vi.fn(), info: vi.fn() };
  const sectionRepository = { findById: vi.fn().mockResolvedValue(null) };
  const sections = new ClassSectionsService(
    sectionRepository as unknown as ClassSectionsRepository,
    new ActiveSchoolService(prisma as never),
    logger as never,
  );
  const schools = {};

  return {
    service: new UsersService(
      users as unknown as UsersRepository,
      passwords as unknown as PasswordService,
      steamxIds,
      sections,
      schools as SchoolsService,
      new ActiveSchoolService(prisma as never),
      logger as never,
    ),
    users,
    prisma,
  };
}

function userRecord(overrides: Partial<UserDetailRecord> = {}): UserDetailRecord {
  return {
    id: 'target-1',
    steamxId: 'GVS-ADAL000',
    name: 'Ada Lovelace',
    email: null,
    status: UserStatus.ACTIVE,
    role: { key: 'teacher', name: 'Teacher' },
    userType: UserType.SCHOOL_STAFF,
    schoolId: 'school-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    mustChangePassword: true,
    studentProfile: null,
    teacherProfile: { primaryAssignment: null },
    ...overrides,
  };
}
