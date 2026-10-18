/** Trusted request identity populated by AuthGuard and consumed by services and decorators. */
import type { UserType } from '../../generated/prisma/client.js';

/** Authenticated identity and authorization attributes attached to each HTTP request. */
export type AuthContext = {
  userId: string;
  steamxId: string;
  name: string;
  roleKey: string;
  userType: UserType;
  schoolId: string | null;
  mustChangePassword: boolean;
};
