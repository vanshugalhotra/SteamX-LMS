import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma, SchoolStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto.js';
import type { SubscriptionListQueryDto } from './dto/subscription-list-query.dto.js';
import type { UpdateSubscriptionDto } from './dto/update-subscription.dto.js';

const SUBSCRIPTION_SELECT = {
  id: true,
  schoolId: true,
  courseId: true,
  startDate: true,
  endDate: true,
  maxDeliveries: true,
  createdAt: true,
  school: { select: { name: true } },
  course: { select: { title: true } },
} satisfies Prisma.SubscriptionSelect;

export type SubscriptionRecord = Prisma.SubscriptionGetPayload<{
  select: typeof SUBSCRIPTION_SELECT;
}>;

export type SubscriptionSummary = {
  schoolId: string;
  courseId: string;
  latestEndDate: string | null;
  activeDeliveries: number;
};

export type SubscriptionEligibilityError =
  | { schoolNotFound: true }
  | { schoolInactive: true }
  | { courseNotFound: true }
  | { courseNotActive: true };

/**
 * Reads and writes subscription rows, including transaction-scoped eligibility checks and
 * school-course summary queries used to build API responses.
 */
@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------- Business date and validation lookups --------------------
  /** Reads the business date from the database clock. */
  getBusinessToday(): Promise<{ today: string }[]> {
    return this.prisma.$queryRaw<{ today: string }[]>`
      SELECT business_today()::text AS today
    `;
  }

  // -------------------- Reads --------------------
  /**
   * Lists terms matching the requested date-derived status and filters.
   * @param query Filters and page settings.
   * @param today Database business date used to select date-derived status.
   * @returns The matching page and total count.
   */
  findMany(
    query: SubscriptionListQueryDto,
    today: string,
  ): Promise<{ items: SubscriptionRecord[]; total: number }> {
    const businessDate = dateValue(today);
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.schoolId === undefined ? {} : { schoolId: query.schoolId }),
      ...(query.courseId === undefined ? {} : { courseId: query.courseId }),
      ...(query.status === 'UPCOMING' ? { startDate: { gt: businessDate } } : {}),
      ...(query.status === 'ACTIVE'
        ? { startDate: { lte: businessDate }, endDate: { gte: businessDate } }
        : {}),
      ...(query.status === 'EXPIRED' ? { endDate: { lt: businessDate } } : {}),
    };
    const orderBy = [
      { startDate: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.SubscriptionOrderByWithRelationInput[];

    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) =>
        this.prisma.subscription.findMany({
          ...args,
          select: SUBSCRIPTION_SELECT,
        }),
      count: (filter) => this.prisma.subscription.count({ where: filter }),
    });
  }

  /** Loads one subscription term by ID. */
  findById(id: string): Promise<SubscriptionRecord | null> {
    return this.prisma.subscription.findUnique({
      where: { id },
      select: SUBSCRIPTION_SELECT,
    });
  }

  // -------------------- Writes --------------------
  /**
   * Checks school and course eligibility under row locks, then creates the term atomically.
   * @param data School-course term details.
   * @returns The created term or a typed eligibility failure.
   */
  create(data: CreateSubscriptionDto): Promise<SubscriptionRecord | SubscriptionEligibilityError> {
    return this.prisma.$transaction(async (tx) => {
      const eligibility = await this.checkGrantEligibility(tx, data.schoolId, data.courseId);
      if (eligibility) {
        return eligibility;
      }

      const subscription = await tx.subscription.create({
        data: {
          schoolId: data.schoolId,
          courseId: data.courseId,
          startDate: dateValue(data.startDate),
          endDate: dateValue(data.endDate),
          maxDeliveries: data.maxDeliveries,
        },
        select: { id: true },
      });
      return tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        select: SUBSCRIPTION_SELECT,
      });
    });
  }

  /**
   * Updates a term and checks its delivery cap in the same transaction.
   * @param id Subscription ID.
   * @param data End date and/or delivery cap changes.
   * @returns The updated term, or a missing/cap-exceeded result.
   */
  update(
    id: string,
    data: UpdateSubscriptionDto,
  ): Promise<{ record: SubscriptionRecord } | { missing: true } | { capExceeded: true }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({
        where: { id },
        select: { schoolId: true, courseId: true, startDate: true },
      });
      if (!current) {
        return { missing: true };
      }

      const activeDeliveryCount = await tx.delivery.count({
        where: {
          schoolId: current.schoolId,
          courseId: current.courseId,
          status: 'ACTIVE',
        },
      });
      if (data.maxDeliveries !== undefined && data.maxDeliveries < activeDeliveryCount) {
        return { capExceeded: true };
      }

      await tx.subscription.update({
        where: { id },
        data: {
          ...(data.endDate === undefined ? {} : { endDate: dateValue(data.endDate) }),
          ...(data.maxDeliveries === undefined ? {} : { maxDeliveries: data.maxDeliveries }),
        },
      });
      const record = await tx.subscription.findUniqueOrThrow({
        where: { id },
        select: SUBSCRIPTION_SELECT,
      });
      return { record };
    });
  }

  /**
   * Deletes a future term or changes the end date of a current term atomically.
   * @param id Subscription ID.
   * @param decision Service-selected revoke operation.
   * @returns The removed or updated term, or null when it no longer exists.
   */
  revoke(
    id: string,
    decision: { action: 'DELETE' } | { action: 'END'; endDate: string },
  ): Promise<SubscriptionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({
        where: { id },
        select: { schoolId: true, courseId: true },
      });
      if (!current) {
        return null;
      }

      if (decision.action === 'DELETE') {
        const record = await tx.subscription.findUniqueOrThrow({
          where: { id },
          select: SUBSCRIPTION_SELECT,
        });
        await tx.subscription.delete({ where: { id } });
        return record;
      }

      await tx.subscription.update({
        where: { id },
        data: { endDate: dateValue(decision.endDate) },
      });
      const record = await tx.subscription.findUniqueOrThrow({
        where: { id },
        select: SUBSCRIPTION_SELECT,
      });
      return record;
    });
  }

  /**
   * Rechecks school and course eligibility under row locks before creating a renewed term.
   * @param current School-course pair from the source term.
   * @param data New term dates and delivery cap.
   * @returns The created term or a typed eligibility failure.
   */
  async renew(
    current: { schoolId: string; courseId: string },
    data: { startDate: string; endDate: string; maxDeliveries: number },
  ): Promise<SubscriptionRecord | SubscriptionEligibilityError> {
    return this.prisma.$transaction(async (tx) => {
      const eligibility = await this.checkGrantEligibility(tx, current.schoolId, current.courseId);
      if (eligibility) {
        return eligibility;
      }

      const created = await tx.subscription.create({
        data: {
          schoolId: current.schoolId,
          courseId: current.courseId,
          startDate: dateValue(data.startDate),
          endDate: dateValue(data.endDate),
          maxDeliveries: data.maxDeliveries,
        },
        select: { id: true },
      });
      return tx.subscription.findUniqueOrThrow({
        where: { id: created.id },
        select: SUBSCRIPTION_SELECT,
      });
    });
  }

  /**
   * Locks the school and course rows while checking grant eligibility.
   * @param tx Transaction used for the check.
   * @param schoolId School to validate.
   * @param courseId Course to validate.
   * @returns The first eligibility failure, or null when both records are active.
   */
  private async checkGrantEligibility(
    tx: Prisma.TransactionClient,
    schoolId: string,
    courseId: string,
  ): Promise<SubscriptionEligibilityError | null> {
    // Keep school and course status stable through the subscription insert in this transaction.
    const [school] = await tx.$queryRaw<{ status: SchoolStatus }[]>`
      SELECT status::text AS status
      FROM schools
      WHERE id = ${schoolId}::uuid
      FOR SHARE
    `;
    if (!school) {
      return { schoolNotFound: true };
    }
    if (school.status !== SchoolStatus.ACTIVE) {
      return { schoolInactive: true };
    }

    const [course] = await tx.$queryRaw<{ status: ContentStatus }[]>`
      SELECT status::text AS status
      FROM courses
      WHERE id = ${courseId}::uuid
      FOR SHARE
    `;
    if (!course) {
      return { courseNotFound: true };
    }
    if (course.status !== ContentStatus.ACTIVE) {
      return { courseNotActive: true };
    }

    return null;
  }

  /**
   * Loads the latest term end date and active delivery count for each unique pair.
   * @param pairs School-course pairs to summarize.
   * @returns One summary for each unique pair.
   */
  async findDerivedFieldsBySchoolCourse(
    pairs: { schoolId: string; courseId: string }[],
  ): Promise<SubscriptionSummary[]> {
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
    return this.prisma.$queryRaw<SubscriptionSummary[]>(Prisma.sql`
      WITH page_pairs(school_id, course_id) AS (VALUES ${values}),
      subscription_stats AS (
        SELECT s.school_id, s.course_id, MAX(s.end_date)::text AS "latestEndDate"
        FROM subscriptions s
        JOIN page_pairs p ON p.school_id = s.school_id AND p.course_id = s.course_id
        GROUP BY s.school_id, s.course_id
      ),
      delivery_stats AS (
        SELECT d.school_id, d.course_id,
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE')::int AS active_deliveries
        FROM deliveries d
        JOIN page_pairs p ON p.school_id = d.school_id AND p.course_id = d.course_id
        GROUP BY d.school_id, d.course_id
      )
      SELECT p.school_id::text AS "schoolId",
        p.course_id::text AS "courseId",
        ss."latestEndDate",
        COALESCE(ds.active_deliveries, 0)::int AS "activeDeliveries"
      FROM page_pairs p
      LEFT JOIN subscription_stats ss USING (school_id, course_id)
      LEFT JOIN delivery_stats ds USING (school_id, course_id)
    `);
  }
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
