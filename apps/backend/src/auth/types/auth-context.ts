import type { UserType } from '../../generated/prisma/client.js';

export type AuthContext = {
  userId: string;
  steamxId: string;
  name: string;
  roleKey: string;
  userType: UserType;
  schoolId: string | null;
  mustChangePassword: boolean;
};
