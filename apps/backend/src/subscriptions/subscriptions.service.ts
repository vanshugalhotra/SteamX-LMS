import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
} from '../common/errors/prisma-error.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { assertPlatformStaff } from '../auth/assert-platform-staff.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto.js';
import type { RenewSubscriptionDto } from './dto/renew-subscription.dto.js';
import type { SubscriptionListQueryDto } from './dto/subscription-list-query.dto.js';
import type { SubscriptionResponseDto } from './dto/subscription-response.dto.js';
import type { UpdateSubscriptionDto } from './dto/update-subscription.dto.js';
import { addDateDays, decideSubscriptionRevoke } from './subscription-rules.js';
import { toSubscriptionResponse } from './subscriptions.mapper.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';
import type {
  SubscriptionEligibilityError,
  SubscriptionRecord,
} from './subscriptions.repository.js';

/**
 * Applies subscription lifecycle rules and maps repository outcomes to API responses.
 * The repository owns persistence and database constraints.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly subscriptions: SubscriptionsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SubscriptionsService.name);
  }

  // ─────────────────────────────────────────
  // POST /subscriptions — Grant a subscription
  // ─────────────────────────────────────────
  /**
   * Grants a term and logs the successful operation.
   * @param actor Platform staff actor.
   * @param body School-course term details.
   * @returns The created term with derived fields.
   * @throws BadRequestException for reversed dates; NotFoundException for missing records; ConflictException for ineligible records or overlap.
   */
  async create(actor: AuthContext, body: CreateSubscriptionDto): Promise<SubscriptionResponseDto> {
    assertPlatformStaff(actor);
    const today = await this.today();
    this.assertDateRange(body.startDate, body.endDate);
    try {
      const result = await this.subscriptions.create(body);
      this.throwEligibilityError(result);
      const subscription = result;
      this.logger.info(
        {
          actorId: actor.userId,
          action: 'grant',
          subscriptionId: subscription.id,
          schoolId: subscription.schoolId,
          courseId: subscription.courseId,
        },
        'Subscription granted',
      );
      return this.toResponse(subscription, today);
    } catch (error) {
      this.throwWriteError(error);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // GET /subscriptions — List subscriptions
  // ─────────────────────────────────────────
  /**
   * Lists terms with one derived school-course summary per page pair.
   * @param actor Platform staff actor.
   * @param query Filters and page settings.
   * @returns A paginated response.
   */
  async findMany(
    actor: AuthContext,
    query: SubscriptionListQueryDto,
  ): Promise<PaginationResponseDto<SubscriptionResponseDto>> {
    assertPlatformStaff(actor);
    const today = await this.today();
    const { items, total } = await this.subscriptions.findMany(query, today);
    const summaries = await this.subscriptions.findDerivedFieldsBySchoolCourse(
      items.map(({ schoolId, courseId }) => ({ schoolId, courseId })),
    );
    const summaryByPair = new Map(
      summaries.map((summary) => [`${summary.schoolId}:${summary.courseId}`, summary]),
    );
    return paginate(
      items.map((item) => {
        const summary = summaryByPair.get(`${item.schoolId}:${item.courseId}`);
        if (!summary) {
          throw new Error('Expected subscription page summary to exist');
        }
        return toSubscriptionResponse(item, today, {
          retainedUntil: summary.latestEndDate,
          activeDeliveries: summary.activeDeliveries,
        });
      }),
      query.page,
      query.limit,
      total,
    );
  }

  // ─────────────────────────────────────────
  // GET /subscriptions/:id — Get a subscription
  // ─────────────────────────────────────────
  /**
   * Loads one term.
   * @param actor Platform staff actor.
   * @param id Subscription UUID.
   * @returns The term with derived fields.
   * @throws NotFoundException when the term does not exist.
   */
  async findById(actor: AuthContext, id: string): Promise<SubscriptionResponseDto> {
    assertPlatformStaff(actor);
    const today = await this.today();
    const subscription = await this.subscriptions.findById(id);
    if (!subscription) {
      throw new NotFoundException(API_ERROR.SUBSCRIPTION_NOT_FOUND);
    }
    return this.toResponse(subscription, today);
  }

  // ─────────────────────────────────────────
  // PATCH /subscriptions/:id — Update a subscription
  // ─────────────────────────────────────────
  /**
   * Updates allowed term fields.
   * @param actor Platform staff actor.
   * @param id Subscription UUID.
   * @param body End date and/or delivery cap.
   * @returns The updated term with derived fields.
   * @throws BadRequestException for an empty or invalid update; NotFoundException if missing; ConflictException for overlap or a cap below active use.
   */
  async update(
    actor: AuthContext,
    id: string,
    body: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    assertPlatformStaff(actor);
    const today = await this.today();
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }

    const current = await this.subscriptions.findById(id);
    if (!current) {
      throw new NotFoundException(API_ERROR.SUBSCRIPTION_NOT_FOUND);
    }
    const currentStart = current.startDate.toISOString().slice(0, 10);
    this.assertDateRange(currentStart, body.endDate ?? current.endDate.toISOString().slice(0, 10));

    try {
      const result = await this.subscriptions.update(id, body);
      if ('missing' in result) {
        throw new NotFoundException(API_ERROR.SUBSCRIPTION_NOT_FOUND);
      }
      if ('capExceeded' in result) {
        throw new ConflictException(API_ERROR.DELIVERY_CAP_BELOW_ACTIVE);
      }

      this.logger.info(
        {
          actorId: actor.userId,
          action: 'patch',
          subscriptionId: result.record.id,
          schoolId: result.record.schoolId,
          courseId: result.record.courseId,
        },
        'Subscription updated',
      );
      return this.toResponse(result.record, today);
    } catch (error) {
      this.throwWriteError(error);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // POST /subscriptions/:id/revoke — Revoke a subscription
  // ─────────────────────────────────────────
  /**
   * Deletes a term starting today or later, or ends a current term yesterday.
   * @param actor Platform staff actor.
   * @param id Subscription UUID.
   * @returns No value after the revoke succeeds.
   * @throws NotFoundException if missing; ConflictException if the term already ended.
   */
  async revoke(actor: AuthContext, id: string): Promise<void> {
    assertPlatformStaff(actor);
    const today = await this.today();
    const current = await this.subscriptions.findById(id);
    if (!current) {
      throw new NotFoundException(API_ERROR.SUBSCRIPTION_NOT_FOUND);
    }
    const currentStart = current.startDate.toISOString().slice(0, 10);
    const currentEnd = current.endDate.toISOString().slice(0, 10);
    const decision = decideSubscriptionRevoke(currentStart, currentEnd, today);
    if (decision.action === 'REJECT') {
      throw new ConflictException(API_ERROR.SUBSCRIPTION_ALREADY_ENDED);
    }

    const subscription = await this.subscriptions.revoke(id, decision);
    if (!subscription) {
      throw new NotFoundException(API_ERROR.SUBSCRIPTION_NOT_FOUND);
    }
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'revoke',
        subscriptionId: subscription.id,
        schoolId: subscription.schoolId,
        courseId: subscription.courseId,
      },
      'Subscription revoked',
    );
  }

  // ─────────────────────────────────────────
  // POST /subscriptions/:id/renew — Renew a subscription
  // ─────────────────────────────────────────
  /**
   * Creates a new term; omitted start date and delivery cap inherit from the source term.
   * @param actor Platform staff actor.
   * @param id Source subscription UUID.
   * @param body New end date and optional start date or delivery cap.
   * @returns The new term with derived fields.
   * @throws NotFoundException if the source is missing; ConflictException for ineligible records or overlap.
   */
  async renew(
    actor: AuthContext,
    id: string,
    body: RenewSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    assertPlatformStaff(actor);
    const today = await this.today();
    const current = await this.subscriptions.findById(id);
    if (!current) {
      throw new NotFoundException(API_ERROR.SUBSCRIPTION_NOT_FOUND);
    }
    const startDate = body.startDate ?? addDateDays(current.endDate.toISOString().slice(0, 10), 1);
    this.assertDateRange(startDate, body.endDate);

    try {
      const result = await this.subscriptions.renew(
        { schoolId: current.schoolId, courseId: current.courseId },
        {
          startDate,
          endDate: body.endDate,
          maxDeliveries: body.maxDeliveries ?? current.maxDeliveries,
        },
      );
      this.throwEligibilityError(result);
      const subscription = result;
      this.logger.info(
        {
          actorId: actor.userId,
          action: 'renew',
          subscriptionId: subscription.id,
          schoolId: subscription.schoolId,
          courseId: subscription.courseId,
        },
        'Subscription renewed',
      );
      return this.toResponse(subscription, today);
    } catch (error) {
      this.throwWriteError(error);
      throw error;
    }
  }

  private async today(): Promise<string> {
    const [row] = await this.subscriptions.getBusinessToday();
    if (!row) {
      throw new Error('business_today() did not return a date');
    }
    return row.today;
  }

  private throwEligibilityError(
    result: SubscriptionRecord | SubscriptionEligibilityError,
  ): asserts result is SubscriptionRecord {
    if ('schoolNotFound' in result) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if ('schoolInactive' in result) {
      throw new ConflictException(API_ERROR.SCHOOL_INACTIVE);
    }
    if ('courseNotFound' in result) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if ('courseNotActive' in result) {
      throw new ConflictException(API_ERROR.COURSE_NOT_ACTIVE);
    }
  }

  private assertDateRange(startDate: string, endDate: string): void {
    if (endDate < startDate) {
      throw new BadRequestException(API_ERROR.SUBSCRIPTION_INVALID_DATE_RANGE);
    }
  }

  private async toResponse(
    subscription: Parameters<typeof toSubscriptionResponse>[0],
    today: string,
  ): Promise<SubscriptionResponseDto> {
    const [summary] = await this.subscriptions.findDerivedFieldsBySchoolCourse([
      { schoolId: subscription.schoolId, courseId: subscription.courseId },
    ]);
    if (!summary) {
      throw new Error('Expected subscription summary to exist');
    }
    return toSubscriptionResponse(subscription, today, {
      retainedUntil: summary.latestEndDate,
      activeDeliveries: summary.activeDeliveries,
    });
  }

  private throwWriteError(error: unknown): void {
    if (!isPrismaKnownError(error) && getPostgresCode(error) === undefined) {
      return;
    }
    const postgresCode = getPostgresCode(error);
    if (postgresCode === '23P01') {
      throw new ConflictException(API_ERROR.SUBSCRIPTION_OVERLAP);
    }

    if (postgresCode === '23000' || (isPrismaKnownError(error) && error.code === 'P2004')) {
      const reason = getPrismaReason(error).toLowerCase();
      if (
        reason.includes('subscriptions require an active course') ||
        reason.includes('trg_subscriptions_require_active_course')
      ) {
        throw new ConflictException(API_ERROR.COURSE_NOT_ACTIVE);
      }
      if (
        reason.includes('subscriptions.max_deliveries cannot be below') ||
        reason.includes('trg_subscriptions_guard_max_deliveries')
      ) {
        throw new ConflictException(API_ERROR.DELIVERY_CAP_BELOW_ACTIVE);
      }
    }
  }
}
