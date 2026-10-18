/** Provides narrow database projections for session authentication and credential workflows. */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Selects only the identity and credential fields needed by authentication workflows. */
@Injectable()
export class AuthContextRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the current account state for each authenticated request.
   * Unlike findLoginUser, it does not select passwordHash; it selects passwordChangedAt
   * so AuthGuard can revoke sessions after a password update.
   */
  findAuthUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        steamxId: true,
        name: true,
        status: true,
        userType: true,
        schoolId: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        role: { select: { key: true } },
        school: { select: { status: true } },
      },
    });
  }

  /**
   * Loads an account for login, including passwordHash for PasswordService.verify.
   * Do not use this broader projection for ordinary authenticated requests.
   */
  findLoginUser(steamxId: string) {
    // This authentication lookup is the only request-path query that loads the password hash.
    return this.prisma.user.findUnique({
      where: { steamxId },
      select: {
        id: true,
        steamxId: true,
        name: true,
        passwordHash: true,
        status: true,
        userType: true,
        schoolId: true,
        mustChangePassword: true,
        role: { select: { key: true } },
        school: { select: { status: true } },
      },
    });
  }

  /** Loads the role-to-permission grants that PermissionsService caches at startup. */
  findRolePermissions(): Promise<
    Array<{ key: string; permissions: Array<{ permission: { key: string } }> }>
  > {
    return this.prisma.role.findMany({
      select: {
        key: true,
        permissions: {
          select: { permission: { select: { key: true } } },
        },
      },
    });
  }

  /** Loads only the fields needed to verify the current user's password change. */
  findCredentials(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { steamxId: true, passwordHash: true },
    });
  }

  /** Finds an account and role for the one-time platform-admin recovery command. */
  findAdminPasswordResetTarget(steamxId: string) {
    return this.prisma.user.findUnique({
      where: { steamxId },
      select: { id: true, role: { select: { key: true } } },
    });
  }

  /** Stores the new hash and timestamp used to invalidate sessions issued before this change. */
  async updatePassword(
    userId: string,
    passwordHash: string,
    mustChangePassword: boolean,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword,
        passwordChangedAt: new Date(),
      },
      select: { id: true },
    });
  }
}
