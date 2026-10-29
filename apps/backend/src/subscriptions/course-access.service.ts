import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserType } from '../generated/prisma/client.js';
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

    await this.assertSubscriptionActive(schoolId, courseId);
  }

  async assertSubscriptionActive(schoolId: string, courseId: string): Promise<void> {
    const [result] = await this.prisma.$queryRaw<{ has_access: boolean }[]>`
      SELECT has_course_access(${schoolId}::uuid, ${courseId}::uuid, business_today()) AS has_access
    `;
    if (!result?.has_access) {
      throw new ForbiddenException(API_ERROR.SUBSCRIPTION_EXPIRED);
    }
  }

  async getCurrentDeliveryLimit(schoolId: string, courseId: string): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ max_deliveries: number }[]>`
      SELECT max_deliveries
      FROM subscriptions
      WHERE school_id = ${schoolId}::uuid
        AND course_id = ${courseId}::uuid
        AND start_date <= business_today()
        AND business_today() <= end_date
    `;
    return row?.max_deliveries ?? null;
  }

  async getSubscriptionActivity(
    pairs: { schoolId: string; courseId: string }[],
  ): Promise<{ schoolId: string; courseId: string; active: boolean }[]> {
    const uniquePairs = [
      ...new Map(pairs.map((pair) => [`${pair.schoolId}:${pair.courseId}`, pair])).values(),
    ];
    if (uniquePairs.length === 0) {
      return [];
    }

    const values = Prisma.join(
      uniquePairs.map(
        ({ schoolId, courseId }) => Prisma.sql`(${schoolId}::uuid, ${courseId}::uuid)`,
      ),
    );
    return this.prisma.$queryRaw<
      { schoolId: string; courseId: string; active: boolean }[]
    >(Prisma.sql`
      WITH page_pairs(school_id, course_id) AS (VALUES ${values})
      SELECT p.school_id::text AS "schoolId",
        p.course_id::text AS "courseId",
        has_course_access(p.school_id, p.course_id, business_today()) AS active
      FROM page_pairs p
    `);
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
