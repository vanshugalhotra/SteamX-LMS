import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, DeliveryStatus, UserType } from '../generated/prisma/client.js';
import { PinoLogger } from 'nestjs-pino';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
  throwConflictOnDuplicate,
} from '../common/errors/prisma-error.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { ActiveSchoolService } from '../common/tenancy/active-school.service.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { CourseAccessService } from '../subscriptions/course-access.service.js';
import type { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import type { DeliveryListQueryDto } from './dto/delivery-list-query.dto.js';
import type { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import type { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import { toDeliveryResponse } from './deliveries.mapper.js';
import { DeliveriesRepository } from './deliveries.repository.js';

/**
 * Applies school, subscription, and delivery lifecycle rules before repository writes.
 * The database repeats critical activation checks to protect concurrent requests.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly deliveries: DeliveriesRepository,
    private readonly activeSchool: ActiveSchoolService,
    private readonly courseAccess: CourseAccessService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveriesService.name);
  }

  // ─────────────────────────────────────────
  // POST /deliveries — Create a delivery
  // ─────────────────────────────────────────
  /**
   * Creates an ACTIVE delivery after scope, course, subscription, and capacity checks.
   * @param actor Authenticated actor.
   * @param body Delivery details, including requested school.
   * @returns The created delivery response.
   * @throws NotFoundException for missing or out-of-scope records; ConflictException for invalid course, duplicate, or cap; ForbiddenException without current access.
   */
  async create(actor: AuthContext, body: CreateDeliveryDto): Promise<DeliveryResponseDto> {
    const school = await this.activeSchool.resolveSchool(actor, body.schoolId);
    const scope = school.id;
    if (!(await this.deliveries.classSectionExistsInSchool(body.classSectionId, scope))) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const course = await this.deliveries.findCourse(body.courseId);
    if (!course) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (course.status !== ContentStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.COURSE_NOT_ACTIVE);
    }

    await this.courseAccess.assertSubscriptionActive(scope, body.courseId);
    await this.assertDeliveryCapacity(scope, body.courseId);

    try {
      // The database trigger repeats the cap check under a subscription-row lock to serialize races.
      const delivery = await this.deliveries.create(body, scope);
      this.logger.info(
        {
          actorId: actor.userId,
          action: 'create',
          deliveryId: delivery.id,
          schoolId: delivery.schoolId,
          courseId: delivery.courseId,
        },
        'Delivery created',
      );
      return this.toResponse(delivery);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.DELIVERY_ALREADY_EXISTS);
      await this.mapDeliveryWriteError(error, scope, body.courseId);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // GET /deliveries — List deliveries
  // ─────────────────────────────────────────
  /**
   * Lists scoped deliveries and attaches current subscription state.
   * @param actor Authenticated actor; school staff are filtered to active assignments.
   * @param query School scope, filters, and page settings.
   * @returns A paginated delivery response.
   */
  async findMany(
    actor: AuthContext,
    query: DeliveryListQueryDto,
  ): Promise<PaginationResponseDto<DeliveryResponseDto>> {
    const scope = resolveSchoolScope(actor, query.schoolId);
    const { items, total } = await this.deliveries.findMany(scope, actor, query);
    const activity = await this.courseAccess.getSubscriptionActivity(
      items.map(({ schoolId, courseId }) => ({ schoolId, courseId })),
    );
    const activeByPair = new Map(
      activity.map(({ schoolId, courseId, active }) => [`${schoolId}:${courseId}`, active]),
    );
    return paginate(
      items.map((delivery) => {
        const key = `${delivery.schoolId}:${delivery.courseId}`;
        const subscriptionActive = activeByPair.get(key);
        if (subscriptionActive === undefined) {
          throw new Error('Expected delivery page subscription activity to exist');
        }
        return toDeliveryResponse(delivery, subscriptionActive);
      }),
      query.page,
      query.limit,
      total,
    );
  }

  // ─────────────────────────────────────────
  // GET /deliveries/:id — Get a delivery
  // ─────────────────────────────────────────
  /**
   * Reads a scoped delivery; school-staff visibility is further limited to active assignments.
   * @param actor Authenticated actor.
   * @param id Delivery UUID.
   * @returns The delivery and current subscription state.
   * @throws NotFoundException when the delivery is missing, foreign, or not assigned to the teacher.
   */
  async findById(actor: AuthContext, id: string): Promise<DeliveryResponseDto> {
    const scope = resolveSchoolScope(actor);
    const teacherId = actor.userType === UserType.SCHOOL_STAFF ? actor.userId : undefined;
    const delivery = await this.deliveries.findById(id, scope, teacherId);
    if (!delivery) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    const [activity] = await this.courseAccess.getSubscriptionActivity([
      { schoolId: delivery.schoolId, courseId: delivery.courseId },
    ]);
    if (!activity) {
      throw new Error('Expected delivery subscription activity to exist');
    }
    return toDeliveryResponse(delivery, activity.active);
  }

  // ─────────────────────────────────────────
  // PATCH /deliveries/:id/status — Change delivery status
  // ─────────────────────────────────────────
  /**
   * Changes delivery status; activation requires a current subscription and available capacity.
   * @param actor Authenticated actor.
   * @param id Delivery UUID.
   * @param body Target status.
   * @returns The updated delivery and current subscription state.
   * @throws NotFoundException if missing; ConflictException for inactive course or cap; ForbiddenException without current access.
   */
  async updateStatus(
    actor: AuthContext,
    id: string,
    body: UpdateDeliveryStatusDto,
  ): Promise<DeliveryResponseDto> {
    const scope = resolveSchoolScope(actor);
    const current = await this.deliveries.findById(id, scope);
    if (!current) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (current.status === body.status) {
      return this.toResponse(current);
    }
    if (body.status === DeliveryStatus.ACTIVE) {
      const course = await this.deliveries.findCourse(current.courseId);
      if (!course) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      if (course.status !== ContentStatus.ACTIVE) {
        throw new ConflictException(API_ERROR.COURSE_NOT_ACTIVE);
      }
      await this.courseAccess.assertSubscriptionActive(current.schoolId, current.courseId);
      await this.assertDeliveryCapacity(current.schoolId, current.courseId);
    }

    try {
      const delivery = await this.deliveries.updateStatus(id, scope, body.status);
      if (!delivery) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      this.logger.info(
        {
          actorId: actor.userId,
          action: 'status_change',
          deliveryId: delivery.id,
          schoolId: delivery.schoolId,
          courseId: delivery.courseId,
        },
        'Delivery status changed',
      );
      return this.toResponse(delivery);
    } catch (error) {
      await this.mapDeliveryWriteError(error, current.schoolId, current.courseId);
      throw error;
    }
  }

  /** Adds current subscription activity to a delivery response. */
  private async toResponse(delivery: Parameters<typeof toDeliveryResponse>[0]) {
    const [activity] = await this.courseAccess.getSubscriptionActivity([
      { schoolId: delivery.schoolId, courseId: delivery.courseId },
    ]);
    if (!activity) {
      throw new Error('Expected delivery subscription activity to exist');
    }
    return toDeliveryResponse(delivery, activity.active);
  }

  /**
   * Requires a current term and checks its active-delivery cap.
   * @param schoolId School that owns the delivery.
   * @param courseId Course whose delivery cap applies.
   * @throws ForbiddenException when no current subscription exists.
   * @throws ConflictException when the active-delivery cap is reached.
   */
  private async assertDeliveryCapacity(schoolId: string, courseId: string): Promise<void> {
    const max = await this.courseAccess.getCurrentDeliveryLimit(schoolId, courseId);
    if (max === null) {
      throw new ForbiddenException(API_ERROR.SUBSCRIPTION_EXPIRED);
    }
    const used = await this.deliveries.countActiveDeliveries(schoolId, courseId);
    if (used >= max) {
      throw new ConflictException({
        code: API_ERROR.DELIVERY_LIMIT_REACHED.code,
        message: `Active delivery limit reached (${used}/${max} used)`,
      });
    }
  }

  /**
   * Converts recognized database trigger failures to delivery domain errors.
   * @param error Error raised by the delivery write.
   * @param schoolId School that owns the delivery.
   * @param courseId Course whose subscription rules apply.
   * @throws ConflictException when the course is inactive or its delivery cap is reached.
   * @throws ForbiddenException when the subscription is no longer current.
   */
  private async mapDeliveryWriteError(
    error: unknown,
    schoolId: string,
    courseId: string,
  ): Promise<void> {
    if (
      (isPrismaKnownError(error) && error.code === 'P2004') ||
      getPostgresCode(error) === '23000'
    ) {
      const reason = getPrismaReason(error).toLowerCase();
      if (reason.includes('deliveries exceed the subscription delivery limit')) {
        const max = await this.courseAccess.getCurrentDeliveryLimit(schoolId, courseId);
        const used = await this.deliveries.countActiveDeliveries(schoolId, courseId);
        throw new ConflictException({
          code: API_ERROR.DELIVERY_LIMIT_REACHED.code,
          message:
            max === null
              ? API_ERROR.DELIVERY_LIMIT_REACHED.message
              : `Active delivery limit reached (${used}/${max} used)`,
        });
      }
      if (reason.includes('deliveries require a current subscription')) {
        throw new ForbiddenException(API_ERROR.SUBSCRIPTION_EXPIRED);
      }
      if (reason.includes('deliveries require an active course')) {
        throw new ConflictException(API_ERROR.COURSE_NOT_ACTIVE);
      }
    }
  }
}
