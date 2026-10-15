/**
 * Maps selected Prisma user records to public response DTOs.
 */
import { UserType } from '../generated/prisma/client.js';
import type { UserDetailRecord, UserListRecord } from './users.repository.js';
import type { UserListItemResponseDto } from './dto/user-list-item-response.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';

export function toUserListItem(user: UserListRecord): UserListItemResponseDto {
  return {
    id: user.id,
    steamxId: user.steamxId,
    name: user.name,
    email: user.email,
    status: user.status,
    role: user.role,
    userType: user.userType,
    schoolId: user.schoolId,
    createdAt: user.createdAt,
  };
}

export function toUserResponse(user: UserDetailRecord): UserResponseDto {
  const profile =
    user.userType === UserType.STUDENT && user.studentProfile
      ? {
          guardianName: user.studentProfile.guardianName,
          classSectionId: user.studentProfile.classSectionId,
        }
      : user.userType === UserType.SCHOOL_STAFF && user.teacherProfile
        ? { primaryAssignment: user.teacherProfile.primaryAssignment }
        : null;

  return {
    id: user.id,
    steamxId: user.steamxId,
    name: user.name,
    email: user.email,
    status: user.status,
    role: user.role,
    userType: user.userType,
    schoolId: user.schoolId,
    createdAt: user.createdAt,
    mustChangePassword: user.mustChangePassword,
    profile,
  };
}
