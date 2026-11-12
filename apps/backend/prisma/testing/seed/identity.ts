/** Creates the fixed schools, class sections, and login accounts used by manual API tests. */
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import { PasswordService } from '../../../src/auth/services/password.service.js';
import { buildSteamxId } from '../../../src/users/steamx-id/steamx-id.js';

const DEV_PASSWORD = 'testing-password';

export type LoginRecord = {
  steamxId: string;
  role: 'admin' | 'teacher' | 'student';
  school: string;
  status: 'ACTIVE' | 'INACTIVE';
};

export type IdentitySeed = {
  admin: { id: string; steamxId: string };
  north: {
    id: string;
    sections: { grade5Blue: string; grade5Green: string; grade6All: string };
    teachers: { ava: string; theo: string; noor: string };
    students: {
      alex: string;
      riley: string;
      jordan: string;
      casey: string;
      drew: string;
      parker: string;
    };
  };
  south: {
    id: string;
    sections: { grade5Blue: string; grade6Red: string; grade7All: string };
    teachers: { liam: string; maya: string; owen: string };
    students: {
      taylor: string;
      morgan: string;
      cameron: string;
      skyler: string;
      hayden: string;
      emery: string;
    };
  };
  loginRows: LoginRecord[];
};

const IDS = {
  northSchool: '019a0000-0000-7000-8000-000000000001',
  southSchool: '019a0000-0000-7000-8000-000000000002',
  northGrade5Blue: '019a0000-0000-7000-8000-000000000011',
  northGrade5Green: '019a0000-0000-7000-8000-000000000012',
  northGrade6All: '019a0000-0000-7000-8000-000000000013',
  southGrade5Blue: '019a0000-0000-7000-8000-000000000014',
  southGrade6Red: '019a0000-0000-7000-8000-000000000015',
  southGrade7All: '019a0000-0000-7000-8000-000000000016',
  admin: '019a0000-0000-7000-8000-000000000021',
  ava: '019a0000-0000-7000-8000-000000000031',
  theo: '019a0000-0000-7000-8000-000000000032',
  noor: '019a0000-0000-7000-8000-000000000033',
  liam: '019a0000-0000-7000-8000-000000000034',
  maya: '019a0000-0000-7000-8000-000000000035',
  owen: '019a0000-0000-7000-8000-000000000036',
  alex: '019a0000-0000-7000-8000-000000000041',
  riley: '019a0000-0000-7000-8000-000000000042',
  jordan: '019a0000-0000-7000-8000-000000000043',
  casey: '019a0000-0000-7000-8000-000000000044',
  taylor: '019a0000-0000-7000-8000-000000000045',
  morgan: '019a0000-0000-7000-8000-000000000046',
  cameron: '019a0000-0000-7000-8000-000000000047',
  skyler: '019a0000-0000-7000-8000-000000000048',
  drew: '019a0000-0000-7000-8000-000000000049',
  parker: '019a0000-0000-7000-8000-000000000050',
  hayden: '019a0000-0000-7000-8000-000000000051',
  emery: '019a0000-0000-7000-8000-000000000052',
} as const;

const SCHOOLS = {
  north: {
    id: IDS.northSchool,
    code: 'NORTH',
    name: 'Northstar Learning School',
    city: 'Portland',
    state: 'Oregon',
    postalCode: '97201',
    country: 'United States',
  },
  south: {
    id: IDS.southSchool,
    code: 'SOUTH',
    name: 'Southridge Academy',
    city: 'Austin',
    state: 'Texas',
    postalCode: '73301',
    country: 'United States',
  },
} as const;

const SECTIONS = [
  { id: IDS.northGrade5Blue, schoolId: IDS.northSchool, className: 'Grade 5', sectionName: 'Blue' },
  {
    id: IDS.northGrade5Green,
    schoolId: IDS.northSchool,
    className: 'Grade 5',
    sectionName: 'Green',
  },
  { id: IDS.northGrade6All, schoolId: IDS.northSchool, className: 'Grade 6', sectionName: 'All' },
  { id: IDS.southGrade5Blue, schoolId: IDS.southSchool, className: 'Grade 5', sectionName: 'Blue' },
  { id: IDS.southGrade6Red, schoolId: IDS.southSchool, className: 'Grade 6', sectionName: 'Red' },
  { id: IDS.southGrade7All, schoolId: IDS.southSchool, className: 'Grade 7', sectionName: 'All' },
];

const TEACHERS = [
  {
    id: IDS.ava,
    name: 'Ava Rivers',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    email: 'ava.rivers@north.test',
    primaryAssignment: 'Robotics',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.theo,
    name: 'Theo Martin',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    email: 'theo.martin@north.test',
    primaryAssignment: 'Robotics Engineering',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.noor,
    name: 'Noor Patel',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    email: 'noor.patel@north.test',
    primaryAssignment: 'Robotics Lab',
    status: 'INACTIVE' as const,
  },
  {
    id: IDS.liam,
    name: 'Liam Chen',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    email: 'liam.chen@south.test',
    primaryAssignment: 'Robotics',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.maya,
    name: 'Maya Ortiz',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    email: 'maya.ortiz@south.test',
    primaryAssignment: 'Robotics Engineering',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.owen,
    name: 'Owen Brooks',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    email: 'owen.brooks@south.test',
    primaryAssignment: 'Robotics Lab',
    status: 'INACTIVE' as const,
  },
];

const STUDENTS = [
  {
    id: IDS.alex,
    name: 'Alex Morgan',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    classSectionId: IDS.northGrade5Blue,
    guardianName: 'Jamie Morgan',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.riley,
    name: 'Riley Bennett',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    classSectionId: IDS.northGrade5Blue,
    guardianName: 'Robin Bennett',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.jordan,
    name: 'Jordan Ellis',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    classSectionId: IDS.northGrade5Green,
    guardianName: 'Morgan Ellis',
    status: 'INACTIVE' as const,
  },
  {
    id: IDS.casey,
    name: 'Casey Turner',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    classSectionId: IDS.northGrade6All,
    guardianName: 'Taylor Turner',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.drew,
    name: 'Drew Foster',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    classSectionId: IDS.northGrade5Green,
    guardianName: 'Cameron Foster',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.parker,
    name: 'Parker Lane',
    schoolId: IDS.northSchool,
    schoolCode: SCHOOLS.north.code,
    classSectionId: IDS.northGrade6All,
    guardianName: 'Morgan Lane',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.taylor,
    name: 'Taylor Reed',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    classSectionId: IDS.southGrade5Blue,
    guardianName: 'Avery Reed',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.morgan,
    name: 'Morgan Lee',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    classSectionId: IDS.southGrade5Blue,
    guardianName: 'Quinn Lee',
    status: 'INACTIVE' as const,
  },
  {
    id: IDS.cameron,
    name: 'Cameron Price',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    classSectionId: IDS.southGrade6Red,
    guardianName: 'Drew Price',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.skyler,
    name: 'Skyler Davis',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    classSectionId: IDS.southGrade7All,
    guardianName: 'Reese Davis',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.hayden,
    name: 'Hayden Scott',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    classSectionId: IDS.southGrade6Red,
    guardianName: 'Parker Scott',
    status: 'ACTIVE' as const,
  },
  {
    id: IDS.emery,
    name: 'Emery Stone',
    schoolId: IDS.southSchool,
    schoolCode: SCHOOLS.south.code,
    classSectionId: IDS.southGrade7All,
    guardianName: 'Drew Stone',
    status: 'ACTIVE' as const,
  },
];

/** Inserts users and their required profiles together so deferred profile triggers pass at commit. */
export async function seedIdentity(prisma: PrismaClient): Promise<IdentitySeed> {
  const [adminRole, teacherRole, studentRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { key: 'admin' } }),
    prisma.role.findUniqueOrThrow({ where: { key: 'teacher' } }),
    prisma.role.findUniqueOrThrow({ where: { key: 'student' } }),
  ]);
  const passwordHash = await new PasswordService().hash(DEV_PASSWORD);
  const loginRows: LoginRecord[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.school.createMany({ data: Object.values(SCHOOLS) });
    await tx.classSection.createMany({ data: SECTIONS });
    await tx.user.create({
      data: {
        id: IDS.admin,
        steamxId: 'STEAMX-ADMIN',
        name: 'Platform Admin',
        passwordHash,
        roleId: adminRole.id,
        userType: 'PLATFORM_STAFF',
        schoolId: null,
        mustChangePassword: false,
      },
    });
    loginRows.push({
      steamxId: 'STEAMX-ADMIN',
      role: 'admin',
      school: 'Platform',
      status: 'ACTIVE',
    });

    for (const teacher of TEACHERS) {
      const steamxId = buildSteamxId(teacher.schoolCode, teacher.name, () => 0);
      await tx.user.create({
        data: {
          id: teacher.id,
          steamxId,
          name: teacher.name,
          email: teacher.email,
          status: teacher.status,
          passwordHash,
          roleId: teacherRole.id,
          userType: 'SCHOOL_STAFF',
          schoolId: teacher.schoolId,
          mustChangePassword: false,
        },
      });
      await tx.teacherProfile.create({
        data: {
          userId: teacher.id,
          schoolId: teacher.schoolId,
          primaryAssignment: teacher.primaryAssignment,
        },
      });
      loginRows.push({
        steamxId,
        role: 'teacher',
        school: teacher.schoolCode,
        status: teacher.status,
      });
    }

    for (const student of STUDENTS) {
      const steamxId = buildSteamxId(student.schoolCode, student.name, () => 0);
      await tx.user.create({
        data: {
          id: student.id,
          steamxId,
          name: student.name,
          status: student.status,
          passwordHash,
          roleId: studentRole.id,
          userType: 'STUDENT',
          schoolId: student.schoolId,
          mustChangePassword: false,
        },
      });
      await tx.studentProfile.create({
        data: {
          userId: student.id,
          schoolId: student.schoolId,
          classSectionId: student.classSectionId,
          guardianName: student.guardianName,
        },
      });
      loginRows.push({
        steamxId,
        role: 'student',
        school: student.schoolCode,
        status: student.status,
      });
    }
  });

  return {
    admin: { id: IDS.admin, steamxId: 'STEAMX-ADMIN' },
    north: {
      id: IDS.northSchool,
      sections: {
        grade5Blue: IDS.northGrade5Blue,
        grade5Green: IDS.northGrade5Green,
        grade6All: IDS.northGrade6All,
      },
      teachers: { ava: IDS.ava, theo: IDS.theo, noor: IDS.noor },
      students: {
        alex: IDS.alex,
        riley: IDS.riley,
        jordan: IDS.jordan,
        casey: IDS.casey,
        drew: IDS.drew,
        parker: IDS.parker,
      },
    },
    south: {
      id: IDS.southSchool,
      sections: {
        grade5Blue: IDS.southGrade5Blue,
        grade6Red: IDS.southGrade6Red,
        grade7All: IDS.southGrade7All,
      },
      teachers: { liam: IDS.liam, maya: IDS.maya, owen: IDS.owen },
      students: {
        taylor: IDS.taylor,
        morgan: IDS.morgan,
        cameron: IDS.cameron,
        skyler: IDS.skyler,
        hayden: IDS.hayden,
        emery: IDS.emery,
      },
    },
    loginRows,
  };
}

export { DEV_PASSWORD };
