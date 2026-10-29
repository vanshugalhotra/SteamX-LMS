import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserType } from '../generated/prisma/client.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * schoolId must come from the loaded resource, never from client input.
   */
  async assertCourseAccess(actor: AuthContext, schoolId: string, courseId: string): Promise<void> {
    if (actor.userType === UserType.PLATFORM_STAFF) {
      return;
    }
    if (actor.schoolId !== schoolId) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const [result] = await this.prisma.$queryRaw<{ has_access: boolean }[]>`
      SELECT has_course_access(${schoolId}::uuid, ${courseId}::uuid, business_today()) AS has_access
    `;
    if (!result?.has_access) {
      throw new ForbiddenException(API_ERROR.SUBSCRIPTION_EXPIRED);
    }
  }

  async getAccessibleCourseIds(actor: AuthContext): Promise<string[]> {
    if (actor.schoolId === null) {
      throw new BadRequestException(API_ERROR.SCHOOL_REQUIRED);
    }

    const rows = await this.prisma.$queryRaw<{ course_id: string }[]>`
      SELECT DISTINCT course_id::text AS course_id
      FROM subscriptions
      WHERE school_id = ${actor.schoolId}::uuid
        AND business_today() BETWEEN start_date AND end_date
    `;
    return rows.map(({ course_id }) => course_id);
  }
}
