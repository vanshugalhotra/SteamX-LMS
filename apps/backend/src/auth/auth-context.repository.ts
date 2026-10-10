import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthContextRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  findLoginUser(steamxId: string) {
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

  findCredentials(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { steamxId: true, passwordHash: true },
    });
  }

  findPasswordResetTarget(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, steamxId: true },
    });
  }

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
