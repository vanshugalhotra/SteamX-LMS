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

/**
 * Provides the database-date subscription checks shared by delivery workflows and course access.
 * School identity must come from an authenticated actor or a loaded resource.
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allows platform staff directly; other actors must match the resource school and have a current term.
   * @param actor Authenticated actor establishing school and platform-staff scope.
   * @param schoolId School that owns the resource.
   * @param courseId Course whose subscription grants access.
   * @throws NotFoundException when a non-platform actor's school differs from the resource school.
   * @throws ForbiddenException when no subscription covers the database business date.
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

  /**
   * Checks whether a subscription for this school-course pair covers the database business date.
   * @param schoolId School that owns the access.
   * @param courseId Course to check.
   * @throws ForbiddenException when no current term exists.
   */
  async assertSubscriptionActive(schoolId: string, courseId: string): Promise<void> {
    const [result] = await this.prisma.$queryRaw<{ has_access: boolean }[]>`
      SELECT has_course_access(${schoolId}::uuid, ${courseId}::uuid, business_today()) AS has_access
    `;
    if (!result?.has_access) {
      throw new ForbiddenException(API_ERROR.SUBSCRIPTION_EXPIRED);
    }
  }

  /**
   * Reads the cap from a term covering the database business date.
   * @param schoolId School that owns the access.
   * @param courseId Course to check.
   * @returns The current cap, or null when no term covers the business date.
   */
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

  /**
   * Reads current subscription state for unique school-course pairs in one query.
   * @param pairs School-course pairs to check.
   * @returns One current-state result per unique pair.
   */
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

  /**
   * Lists currently accessible course IDs for the actor's school.
   * @param actor Actor whose school defines the query scope.
   * @returns Course IDs with a term covering the business date.
   * @throws BadRequestException when the actor has no school.
   */
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
