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
}
