/** Applies assignment creation and read rules for visible deliveries. */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { paginate } from '../../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { CourseModulesService } from '../../curriculum/course-modules/course-modules.service.js';
import { LessonsService } from '../../curriculum/lessons/lessons.service.js';
import { parseAssignmentBlueprint } from '../blueprint/blueprint.validator.js';
import type {
  CreateDeliveryAssignmentDto,
  DeliveryAssignmentListQueryDto,
} from '../dto/delivery-assignment-request.dto.js';
import type {
  DeliveryAssignmentResponseDto,
  DeliveryAssignmentSummaryDto,
} from '../dto/delivery-assignment-response.dto.js';
import { DeliveryAssignmentAccessService } from './delivery-assignment-access.service.js';
import { toDeliveryAssignmentDetailResponse } from './delivery-assignment-response.js';
import { toDeliveryAssignmentSummary } from './delivery-assignments.mapper.js';
import { DeliveryAssignmentsRepository } from './delivery-assignments.repository.js';

/** Creates DRAFT assignments and serves delivery-scoped list and detail reads. */
@Injectable()
export class DeliveryAssignmentsService {
  constructor(
    private readonly access: DeliveryAssignmentAccessService,
    private readonly assignments: DeliveryAssignmentsRepository,
    private readonly modules: CourseModulesService,
    private readonly lessons: LessonsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryAssignmentsService.name);
  }

  /** Creates an incomplete-capable DRAFT assignment and validates its optional course anchor. */
  async create(
    actor: AuthContext,
    deliveryId: string,
    body: CreateDeliveryAssignmentDto,
  ): Promise<DeliveryAssignmentResponseDto> {
    const delivery = await this.access.loadForWrite(actor, deliveryId);
    await this.assertAnchor(delivery.courseId, body.moduleId, body.lessonId);
    const blueprint = parseAssignmentBlueprint(
      body.blueprint ?? { items: [], rubric: null, allowResubmission: false },
    );
    const assignment = await this.assignments.create({
      schoolId: delivery.schoolId,
      deliveryId: delivery.id,
      courseId: delivery.courseId,
      moduleId: body.moduleId ?? null,
      lessonId: body.lessonId ?? null,
      title: body.title,
      description: body.description ?? null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      createdById: actor.userId,
      blueprint,
    });
    this.logger.info(
      { actorId: actor.userId, deliveryId, assignmentId: assignment.id },
      'Delivery assignment created',
    );
    return toDeliveryAssignmentDetailResponse(this.assignments, assignment);
  }

  /** Lists paginated summaries and resolves all page counts in two grouped queries. */
  async findMany(
    actor: AuthContext,
    deliveryId: string,
    query: DeliveryAssignmentListQueryDto,
  ): Promise<PaginationResponseDto<DeliveryAssignmentSummaryDto>> {
    await this.access.loadForRead(actor, deliveryId);
    const page = await this.assignments.findMany(deliveryId, query);
    const counts = await this.assignments.findCounts(page.items.map(({ id }) => id));
    return paginate(
      page.items.map((assignment) =>
        toDeliveryAssignmentSummary(assignment, counts.get(assignment.id)!),
      ),
      query.page,
      query.limit,
      page.total,
    );
  }

  /** Reads a full assignment only after verifying active-teacher visibility of its delivery. */
  async findById(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
  ): Promise<DeliveryAssignmentResponseDto> {
    await this.access.loadForRead(actor, deliveryId);
    const assignment = await this.requireAssignment(deliveryId, assignmentId);
    return toDeliveryAssignmentDetailResponse(this.assignments, assignment);
  }

  /** Validates optional module and lesson anchors using the curriculum's scoped services. */
  private async assertAnchor(
    courseId: string,
    moduleId?: string,
    lessonId?: string,
  ): Promise<void> {
    if (moduleId !== undefined && !(await this.modules.findAssignmentAnchor(courseId, moduleId))) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (lessonId !== undefined && !(await this.lessons.findAssignmentAnchor(courseId, lessonId))) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
  }

  /** Loads an assignment in its delivery scope so missing and foreign IDs share a 404. */
  private async requireAssignment(deliveryId: string, assignmentId: string) {
    const assignment = await this.assignments.findById(deliveryId, assignmentId);
    if (!assignment) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return assignment;
  }
}
