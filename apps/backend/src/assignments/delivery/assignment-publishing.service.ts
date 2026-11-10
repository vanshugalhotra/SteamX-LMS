/** Applies assignment publish and unpublish checks in the required error-priority order. */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AssignmentStatus, LessonAudience } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { LessonsService } from '../../curriculum/lessons/lessons.service.js';
import { assertPublishableBlueprint } from '../blueprint/blueprint.validator.js';
import { toAssignmentBlueprint } from '../blueprint/assignment-blueprint.mapper.js';
import { DeliveryAssignmentAccessService } from './delivery-assignment-access.service.js';
import type { DeliveryAssignmentResponseDto } from '../dto/delivery-assignment-response.dto.js';
import { toDeliveryAssignmentResponse } from './delivery-assignments.mapper.js';
import { DeliveryAssignmentsRepository } from './delivery-assignments.repository.js';
import type { AssignmentDetailRecord } from './delivery-assignments.repository.js';

/** Publishes assignments only after delivery, subscription, due-date, blueprint, and lesson checks. */
@Injectable()
export class AssignmentPublishingService {
  constructor(
    private readonly access: DeliveryAssignmentAccessService,
    private readonly assignments: DeliveryAssignmentsRepository,
    private readonly lessons: LessonsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AssignmentPublishingService.name);
  }

  /** Publishes a DRAFT or UNPUBLISHED assignment and preserves its first publish timestamp. */
  async publish(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
  ): Promise<DeliveryAssignmentResponseDto> {
    const delivery = await this.access.loadForRead(actor, deliveryId);
    const current = await this.requireAssignment(deliveryId, assignmentId);
    await this.access.assertWriteEligibility(delivery);
    if (current.status === AssignmentStatus.PUBLISHED) {
      return this.toResponse(current);
    }
    if (current.dueAt === null) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_DUE_DATE_REQUIRED);
    }
    assertPublishableBlueprint(toAssignmentBlueprint(current));
    if (current.lessonId !== null) {
      const lesson = await this.lessons.findAssignmentAnchor(delivery.courseId, current.lessonId);
      if (!lesson) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      if (lesson.audience === LessonAudience.TEACHER_ONLY) {
        throw new ConflictException(API_ERROR.ASSIGNMENT_LESSON_NOT_STUDENT_FACING);
      }
    }

    const updated = await this.assignments.publish(
      deliveryId,
      assignmentId,
      current.status,
      current.publishedAt ?? new Date(),
    );
    if (!updated) {
      const latest = await this.requireAssignment(deliveryId, assignmentId);
      if (latest.status === AssignmentStatus.PUBLISHED) {
        return this.toResponse(latest);
      }
      throw new ConflictException(API_ERROR.CONFLICT);
    }
    this.logger.info(
      { actorId: actor.userId, deliveryId, assignmentId },
      'Delivery assignment published',
    );
    return this.toResponse(updated);
  }

  /** Hides a published assignment; repeated unpublishes succeed and DRAFT cannot be unpublished. */
  async unpublish(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
  ): Promise<DeliveryAssignmentResponseDto> {
    const delivery = await this.access.loadForRead(actor, deliveryId);
    const current = await this.requireAssignment(deliveryId, assignmentId);
    await this.access.assertWriteEligibility(delivery);
    if (current.status === AssignmentStatus.UNPUBLISHED) {
      return this.toResponse(current);
    }
    if (current.status === AssignmentStatus.DRAFT) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_UNPUBLISHED_FROM_DRAFT);
    }
    const updated = await this.assignments.unpublish(deliveryId, assignmentId, current.status);
    if (!updated) {
      const latest = await this.requireAssignment(deliveryId, assignmentId);
      if (latest.status === AssignmentStatus.UNPUBLISHED) {
        return this.toResponse(latest);
      }
      throw new ConflictException(API_ERROR.CONFLICT);
    }
    this.logger.info(
      { actorId: actor.userId, deliveryId, assignmentId },
      'Delivery assignment unpublished',
    );
    return this.toResponse(updated);
  }

  /** Loads an assignment only when it belongs to the already-visible delivery. */
  private async requireAssignment(deliveryId: string, assignmentId: string) {
    const assignment = await this.assignments.findById(deliveryId, assignmentId);
    if (!assignment) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return assignment;
  }

  /** Maps assignment detail and aggregates after a lifecycle operation. */
  private async toResponse(assignment: AssignmentDetailRecord) {
    const counts = (await this.assignments.findCounts([assignment.id])).get(assignment.id)!;
    return toDeliveryAssignmentResponse(assignment, {
      ...counts,
      itemCount: assignment.items.length,
    });
  }
}
