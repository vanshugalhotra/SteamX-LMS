import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserType } from '../src/generated/prisma/client.js';
import { getPostgresCode, isPrismaKnownError } from '../src/common/errors/prisma-error.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ROLLBACK_SENTINEL = new Error('ROLLBACK_IDENTITY_CONSTRAINT_TEST');
const PASSWORD_HASH = 'test-only-password-hash';

type TransactionTest = (tx: Prisma.TransactionClient) => Promise<void>;
type SchoolOverrides = {
  code?: string;
  name?: string;
  city?: string;
  contactEmail?: string | null;
};

describe('Identity database constraints (e2e)', () => {
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

  async function withRollback(test: TransactionTest): Promise<void> {
    let testFailed = false;
    let testError: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        try {
          await test(tx);
        } catch (error) {
          testFailed = true;
          testError = error;
        }

        throw ROLLBACK_SENTINEL;
      });
    } catch (error) {
      if (error !== ROLLBACK_SENTINEL) {
        throw error;
      }
    }

    if (testFailed) {
      throw testError;
    }
  }

  async function createSchool(
    tx: Prisma.TransactionClient,
    overrides: SchoolOverrides = {},
  ): Promise<{ id: string }> {
    return tx.school.create({
      data: {
        code: 'TST1',
        name: 'Test School',
        city: 'Test City',
        state: 'Test State',
        postalCode: '00000',
        country: 'Test Country',
        ...overrides,
      },
      select: { id: true },
    });
  }

  async function createUser(
    tx: Prisma.TransactionClient,
    userType: UserType,
    schoolId: string | null,
    overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
  ): Promise<{ id: string }> {
    const role = await tx.role.create({
      data: {
        key: `test-${userType.toLowerCase()}`,
        name: 'Test Role',
        userType,
      },
    });

    return tx.user.create({
      data: {
        steamxId: 'TST123',
        name: 'Test User',
        passwordHash: PASSWORD_HASH,
        roleId: role.id,
        userType,
        schoolId,
        ...overrides,
      },
      select: { id: true },
    });
  }

  async function expectConstraint(
    operation: () => Promise<unknown>,
    postgresCode: '23514' | '23505',
    constraintName: string,
  ): Promise<void> {
    let databaseError: unknown;

    try {
      await operation();
    } catch (error) {
      databaseError = error;
    }

    expect(databaseError).toBeDefined();
    if (!isPrismaKnownError(databaseError)) {
      throw new Error('Expected a Prisma database error');
    }

    expect(getPostgresCode(databaseError)).toBe(postgresCode);
    expect(
      JSON.stringify({
        message: databaseError.message,
        meta: databaseError.meta,
      }),
    ).toContain(constraintName);
  }

  const allowedCases: Array<{ name: string; run: TransactionTest }> = [
    {
      name: 'valid school',
      run: async (tx) => {
        await expect(createSchool(tx)).resolves.toMatchObject({ id: expect.any(String) });
      },
    },
    {
      name: 'platform staff without a school',
      run: async (tx) => {
        await expect(createUser(tx, UserType.PLATFORM_STAFF, null)).resolves.toMatchObject({
          id: expect.any(String),
        });
      },
    },
    {
      name: 'teacher with a school',
      run: async (tx) => {
        const school = await createSchool(tx);
        const user = await createUser(tx, UserType.SCHOOL_STAFF, school.id);
        const profile = await tx.teacherProfile.create({
          data: { userId: user.id, schoolId: school.id },
        });

        expect(profile.userType).toBe(UserType.SCHOOL_STAFF);
      },
    },
    {
      name: 'student without an email',
      run: async (tx) => {
        const school = await createSchool(tx);
        const user = await createUser(tx, UserType.STUDENT, school.id);
        const section = await tx.classSection.create({
          data: { schoolId: school.id, className: 'Class 5' },
          select: { id: true },
        });
        const profile = await tx.studentProfile.create({
          data: {
            userId: user.id,
            schoolId: school.id,
            classSectionId: section.id,
          },
        });

        expect(profile.userType).toBe(UserType.STUDENT);
      },
    },
    {
      name: 'same class and section names in different schools',
      run: async (tx) => {
        const firstSchool = await createSchool(tx, { code: 'TST1' });
        const secondSchool = await createSchool(tx, { code: 'TST2' });
        const first = await tx.classSection.create({
          data: { schoolId: firstSchool.id, className: 'Class 5', sectionName: 'A' },
        });
        const second = await tx.classSection.create({
          data: { schoolId: secondSchool.id, className: 'Class 5', sectionName: 'A' },
        });

        expect(first.id).not.toBe(second.id);
      },
    },
  ];

  it.each(allowedCases)('allows $name', async ({ run }) => {
    await withRollback(run);
  });

  const invalidSteamxIds = [
    { name: 'lowercase', value: 'abc' },
    { name: 'spaces', value: 'AB C' },
    { name: 'leading or trailing whitespace', value: ' TST123 ' },
    { name: 'invalid characters', value: 'AB$C' },
  ];

  it.each(invalidSteamxIds)('rejects a $name steamx_id', async ({ value }) => {
    await withRollback(async (tx) => {
      const school = await createSchool(tx);
      await expectConstraint(
        () =>
          createUser(tx, UserType.SCHOOL_STAFF, school.id, {
            steamxId: value,
          }),
        '23514',
        'users_steamx_id_fmt',
      );
    });
  });

  const invalidUserCases: Array<{
    name: string;
    userType: UserType;
    schoolId: 'present' | 'missing';
    email?: string;
    nameValue?: string;
    constraint: string;
  }> = [
    {
      name: 'platform staff with a school',
      userType: UserType.PLATFORM_STAFF,
      schoolId: 'present',
      constraint: 'users_school_scope',
    },
    {
      name: 'school staff without a school',
      userType: UserType.SCHOOL_STAFF,
      schoolId: 'missing',
      constraint: 'users_school_scope',
    },
    {
      name: 'student with an email',
      userType: UserType.STUDENT,
      schoolId: 'present',
      email: 'student@example.com',
      constraint: 'users_student_no_email',
    },
    {
      name: 'user with uppercase email',
      userType: UserType.SCHOOL_STAFF,
      schoolId: 'present',
      email: 'USER@example.com',
      constraint: 'users_email_norm',
    },
    {
      name: 'user with whitespace around email',
      userType: UserType.SCHOOL_STAFF,
      schoolId: 'present',
      email: ' user@example.com ',
      constraint: 'users_email_norm',
    },
    {
      name: 'user with a blank name',
      userType: UserType.SCHOOL_STAFF,
      schoolId: 'present',
      nameValue: '   ',
      constraint: 'users_name_nonempty',
    },
  ];

  it.each(invalidUserCases)('rejects $name', async (testCase) => {
    await withRollback(async (tx) => {
      const school = testCase.schoolId === 'present' ? await createSchool(tx) : undefined;
      await expectConstraint(
        () =>
          createUser(tx, testCase.userType, school?.id ?? null, {
            ...(testCase.email === undefined ? {} : { email: testCase.email }),
            ...(testCase.nameValue === undefined ? {} : { name: testCase.nameValue }),
          }),
        '23514',
        testCase.constraint,
      );
    });
  });

  const invalidSchoolCases: Array<{
    name: string;
    overrides: SchoolOverrides;
    constraint: string;
  }> = [
    { name: 'malformed code', overrides: { code: 'lowercase' }, constraint: 'schools_code_fmt' },
    { name: 'blank name', overrides: { name: '   ' }, constraint: 'schools_name_nonempty' },
    { name: 'blank city', overrides: { city: '   ' }, constraint: 'schools_city_nonempty' },
    {
      name: 'uppercase contact email',
      overrides: { contactEmail: 'ADMIN@example.com' },
      constraint: 'schools_contact_email_norm',
    },
  ];

  it.each(invalidSchoolCases)('rejects a school with $name', async (testCase) => {
    await withRollback(async (tx) => {
      await expectConstraint(
        () => createSchool(tx, testCase.overrides),
        '23514',
        testCase.constraint,
      );
    });
  });

  const invalidProfiles: Array<{
    name: string;
    profileType: 'student' | 'teacher';
    userType: UserType;
    constraint: string;
  }> = [
    {
      name: 'student profile for school staff',
      profileType: 'student',
      userType: UserType.SCHOOL_STAFF,
      constraint: 'student_profiles_type',
    },
    {
      name: 'teacher profile for a student',
      profileType: 'teacher',
      userType: UserType.STUDENT,
      constraint: 'teacher_profiles_type',
    },
  ];

  it.each(invalidProfiles)('rejects a $name', async (testCase) => {
    await withRollback(async (tx) => {
      const school = await createSchool(tx);
      const user = await createUser(tx, testCase.userType, school.id);
      const section = await tx.classSection.create({
        data: { schoolId: school.id, className: 'Class 5' },
        select: { id: true },
      });

      if (testCase.profileType === 'student') {
        await expectConstraint(
          () =>
            tx.studentProfile.create({
              data: {
                userId: user.id,
                schoolId: school.id,
                userType: testCase.userType,
                classSectionId: section.id,
              },
            }),
          '23514',
          testCase.constraint,
        );
      } else {
        await expectConstraint(
          () =>
            tx.teacherProfile.create({
              data: {
                userId: user.id,
                schoolId: school.id,
                userType: testCase.userType,
              },
            }),
          '23514',
          testCase.constraint,
        );
      }
    });
  });

  const invalidSectionNames = [
    { name: 'blank class name', className: '   ', sectionName: 'A' },
    { name: 'blank section name', className: 'Class 5', sectionName: '   ' },
    { name: 'whitespace-padded class name', className: ' Class 5', sectionName: 'A' },
    { name: 'whitespace-padded section name', className: 'Class 5', sectionName: 'A ' },
  ];

  it.each(invalidSectionNames)('rejects a section with $name', async (testCase) => {
    await withRollback(async (tx) => {
      const school = await createSchool(tx);
      await expectConstraint(
        () =>
          tx.classSection.create({
            data: {
              schoolId: school.id,
              className: testCase.className,
              sectionName: testCase.sectionName,
            },
          }),
        '23514',
        'class_sections_names_ok',
      );
    });
  });

  it('rejects class and section names that differ only by case within a school', async () => {
    await withRollback(async (tx) => {
      const school = await createSchool(tx);
      await tx.classSection.create({
        data: { schoolId: school.id, className: 'Class 5', sectionName: 'A' },
      });

      await expectConstraint(
        () =>
          tx.classSection.create({
            data: { schoolId: school.id, className: 'class 5', sectionName: 'a' },
          }),
        '23505',
        'class_sections_school_names_uq',
      );
    });
  });
});
