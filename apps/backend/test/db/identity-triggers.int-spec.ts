import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Prisma, UserType } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestUser } from '../factories/fixtures.js';
import { withRollback } from '../setup/with-rollback.js';
import { expectTriggerMessage } from '../setup/expect-trigger.js';

const PASSWORD_HASH = 'test-only-password-hash';

describe('Identity and profile triggers', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createSchool(tx: Prisma.TransactionClient): Promise<{ id: string }> {
    return tx.school.create({
      data: {
        code: `TRG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        name: 'Trigger Test School',
        city: 'Test City',
        state: 'Test State',
        postalCode: '00000',
        country: 'Test Country',
      },
      select: { id: true },
    });
  }

  it('rejects changes to roles.key', async () => {
    await withRollback(prisma, async (tx) => {
      const role = await tx.role.create({
        data: {
          key: 'trigger-test-role',
          name: 'Trigger Test Role',
          userType: UserType.PLATFORM_STAFF,
        },
        select: { id: true },
      });

      await expectTriggerMessage(
        () =>
          tx.$executeRaw`UPDATE roles SET key = 'trigger-test-role-renamed' WHERE id = ${role.id}`,
        'roles.key is immutable',
      );
    });
  });

  it('rejects changes to schools.code', async () => {
    await withRollback(prisma, async (tx) => {
      const school = await createSchool(tx);

      await expectTriggerMessage(
        () => tx.$executeRaw`UPDATE schools SET code = 'TRGCHANGED' WHERE id = ${school.id}::uuid`,
        'schools.code is immutable',
      );
    });
  });

  it('rejects changes to class_sections.school_id', async () => {
    await withRollback(prisma, async (tx) => {
      const school = await createSchool(tx);
      const anotherSchool = await createSchool(tx);
      const classSection = await tx.classSection.create({
        data: { schoolId: school.id, className: 'Trigger Test Class' },
        select: { id: true },
      });

      await expectTriggerMessage(
        () =>
          tx.$executeRaw`UPDATE class_sections SET school_id = ${anotherSchool.id}::uuid WHERE id = ${classSection.id}::uuid`,
        'class_sections.school_id is immutable',
      );
    });
  });

  it.each([
    { column: 'user_type', value: 'STUDENT', expected: 'users.user_type is immutable' },
    { column: 'school_id', value: null, expected: 'users.school_id is immutable' },
    { column: 'steamx_id', value: 'CHANGED123', expected: 'users.steamx_id is immutable' },
  ])('rejects changes to users.$column', async ({ column, value, expected }) => {
    await withRollback(prisma, async (tx) => {
      const user = await createTestUser(tx, {
        userType: UserType.SCHOOL_STAFF,
        name: 'Immutable User',
        passwordHash: PASSWORD_HASH,
      });

      const operation =
        column === 'user_type'
          ? () => tx.$executeRaw`UPDATE users SET user_type = 'STUDENT' WHERE id = ${user.id}::uuid`
          : column === 'school_id'
            ? () => tx.$executeRaw`UPDATE users SET school_id = NULL WHERE id = ${user.id}::uuid`
            : () =>
                tx.user.update({
                  where: { id: user.id },
                  data: { steamxId: value ?? '' },
                });

      await expectTriggerMessage(operation, expected);
    });
  });

  it('allows mutable updates to school and user names', async () => {
    await withRollback(prisma, async (tx) => {
      const user = await createTestUser(tx, {
        userType: UserType.SCHOOL_STAFF,
        name: 'Before Update',
        passwordHash: PASSWORD_HASH,
      });

      await expect(
        tx.$executeRaw`UPDATE schools SET name = 'Renamed School' WHERE id = ${user.schoolId}::uuid`,
      ).resolves.toBe(1);
      await expect(
        tx.$executeRaw`UPDATE users SET name = 'Renamed User' WHERE id = ${user.id}::uuid`,
      ).resolves.toBe(1);
      await expect(
        tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } }),
      ).resolves.toEqual({ name: 'Renamed User' });
    });
  });

  it.each([
    {
      userType: UserType.STUDENT,
      roleKey: 'student',
      message: 'users.student_profile is required',
    },
    {
      userType: UserType.SCHOOL_STAFF,
      roleKey: 'teacher',
      message: 'users.teacher_profile is required',
    },
  ])(
    'rejects a $roleKey user without a profile when constraints are immediate',
    async ({ userType, roleKey, message }) => {
      await withRollback(prisma, async (tx) => {
        const school = await createSchool(tx);
        const role = await tx.role.findUniqueOrThrow({
          where: { key: roleKey },
          select: { id: true },
        });

        await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        await expectTriggerMessage(
          () =>
            tx.user.create({
              data: {
                steamxId: `TRG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
                name: 'Profileless User',
                passwordHash: PASSWORD_HASH,
                roleId: role.id,
                userType,
                schoolId: school.id,
              },
            }),
          message,
        );
      });
    },
  );

  it('allows valid profiles and a platform admin when constraints are immediate', async () => {
    await withRollback(prisma, async (tx) => {
      const student = await createTestUser(tx, {
        userType: UserType.STUDENT,
        name: 'Valid Student',
        passwordHash: PASSWORD_HASH,
      });
      const teacher = await createTestUser(tx, {
        userType: UserType.SCHOOL_STAFF,
        name: 'Valid Teacher',
        passwordHash: PASSWORD_HASH,
      });
      const admin = await createTestUser(tx, {
        userType: UserType.PLATFORM_STAFF,
        name: 'Platform Admin',
        passwordHash: PASSWORD_HASH,
      });

      await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      await expect(
        tx.user.findMany({ where: { id: { in: [student.id, teacher.id, admin.id] } } }),
      ).resolves.toHaveLength(3);
    });
  });

  it('allows an unprofiled user to be inserted and deleted in the same transaction', async () => {
    await withRollback(prisma, async (tx) => {
      const school = await createSchool(tx);
      const role = await tx.role.findUniqueOrThrow({
        where: { key: 'student' },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          steamxId: `TRG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          name: 'Deleted Before Commit',
          passwordHash: PASSWORD_HASH,
          roleId: role.id,
          userType: UserType.STUDENT,
          schoolId: school.id,
        },
        select: { id: true },
      });

      await tx.user.delete({ where: { id: user.id } });
    });
  });

  it('checks the current role when the role changes before commit', async () => {
    await withRollback(prisma, async (tx) => {
      const school = await createSchool(tx);
      const teacherRole = await tx.role.findUniqueOrThrow({
        where: { key: 'teacher' },
        select: { id: true },
      });
      const otherSchoolStaffRole = await tx.role.create({
        data: {
          key: `trigger-school-staff-${randomUUID().replaceAll('-', '').slice(0, 8)}`,
          name: 'Other School Staff',
          userType: UserType.SCHOOL_STAFF,
        },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          steamxId: `TRG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          name: 'Role Changed Before Commit',
          passwordHash: PASSWORD_HASH,
          roleId: teacherRole.id,
          userType: UserType.SCHOOL_STAFF,
          schoolId: school.id,
        },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { roleId: otherSchoolStaffRole.id },
      });
    });
  });

  it('rejects a student without a profile at commit and rolls back the user', async () => {
    const steamxId = `TRG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const schoolCode = `TRG${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    let commitError: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        const school = await tx.school.create({
          data: {
            code: schoolCode,
            name: 'Commit Trigger School',
            city: 'Test City',
            state: 'Test State',
            postalCode: '00000',
            country: 'Test Country',
          },
          select: { id: true },
        });
        const role = await tx.role.findUniqueOrThrow({
          where: { key: 'student' },
          select: { id: true },
        });

        await tx.user.create({
          data: {
            steamxId,
            name: 'Unprofiled Student',
            passwordHash: PASSWORD_HASH,
            roleId: role.id,
            userType: UserType.STUDENT,
            schoolId: school.id,
          },
        });
      });
    } catch (error) {
      commitError = error;
    }

    const metadata =
      typeof commitError === 'object' && commitError !== null && 'meta' in commitError
        ? commitError.meta
        : undefined;
    const errorText = commitError instanceof Error ? commitError.message : String(commitError);
    expect(commitError).toBeDefined();
    expect(`${errorText} ${JSON.stringify(metadata)}`).toContain(
      'users.student_profile is required',
    );
    await expect(prisma.user.findUnique({ where: { steamxId } })).resolves.toBeNull();
    await expect(prisma.school.findUnique({ where: { code: schoolCode } })).resolves.toBeNull();
  });
});
