import type { Prisma } from '../generated/prisma/client.js';

export const USER_LIST_SELECT = {
  id: true,
  steamxId: true,
  name: true,
  email: true,
  status: true,
  role: { select: { key: true, name: true } },
  userType: true,
  schoolId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const USER_DETAIL_SELECT = {
  ...USER_LIST_SELECT,
  mustChangePassword: true,
  studentProfile: { select: { guardianName: true, classSectionId: true } },
  teacherProfile: { select: { primaryAssignment: true } },
} satisfies Prisma.UserSelect;

export type UserListRecord = Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>;
export type UserDetailRecord = Prisma.UserGetPayload<{ select: typeof USER_DETAIL_SELECT }>;
