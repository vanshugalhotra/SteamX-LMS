/**
 * Resolves the school scope for the caller and asserts the school is active.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SchoolStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { API_ERROR } from '../errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { resolveSchoolScope } from './school-scope.js';

@Injectable()
export class ActiveSchoolService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(actor: AuthContext, requestedSchoolId?: string): Promise<string> {
    const school = await this.resolveSchool(actor, requestedSchoolId);
    return school.id;
  }

  async resolveSchool(
    actor: AuthContext,
    requestedSchoolId?: string,
  ): Promise<{ id: string; code: string }> {
    const schoolId = resolveSchoolScope(actor, requestedSchoolId);
    if (!schoolId) {
      throw new BadRequestException(API_ERROR.SCHOOL_REQUIRED);
    }

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, code: true, status: true },
    });
    if (!school) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (school.status !== SchoolStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.SCHOOL_INACTIVE);
    }
    return { id: school.id, code: school.code };
  }
}
