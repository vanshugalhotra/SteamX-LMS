/** Applies assignment metadata/content editability and deletion rules. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { AssignmentStatus } from '../../generated/prisma/client.js';
import { getPrismaReason, isForeignKeyViolation } from '../../common/errors/prisma-error.js';
import { parseAssignmentBlueprint } from '../blueprint/blueprint.validator.js';
import type { AssignmentBlueprint } from '../blueprint/blueprint.schema.js';
import { isAssignmentContentUnlocked } from './assignment-editability.js';
import { DeliveryAssignmentAccessService } from './delivery-assignment-access.service.js';
import { toAssignmentBlueprint } from '../blueprint/assignment-blueprint.mapper.js';
import type { UpdateDeliveryAssignmentDto } from '../dto/delivery-assignment-request.dto.js';
import type { DeliveryAssignmentResponseDto } from '../dto/delivery-assignment-response.dto.js';
import { toDeliveryAssignmentResponse } from './delivery-assignments.mapper.js';
import { DeliveryAssignmentsRepository } from './delivery-assignments.repository.js';
import type { AssignmentDetailRecord } from './delivery-assignments.repository.js';

/** Performs PATCH and DELETE operations once delivery visibility is established. */
@Injectable()
export class DeliveryAssignmentEditsService {
  constructor(
    private readonly access: DeliveryAssignmentAccessService,
    private readonly assignments: DeliveryAssignmentsRepository,
  ) {}

  /** Applies metadata changes and replaces editable content atomically. */
  async update(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
    body: UpdateDeliveryAssignmentDto,
  ): Promise<DeliveryAssignmentResponseDto> {
    const delivery = await this.access.loadForRead(actor, deliveryId);
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }
    const current = await this.requireAssignment(deliveryId, assignmentId);
    await this.access.assertWriteEligibility(delivery);
    if (current.status === AssignmentStatus.PUBLISHED && body.dueAt === null) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_DUE_DATE_REQUIRED);
    }
    const hasContentPatch = body.items !== undefined || body.rubric !== undefined;
    const isTemplateCopy = current.sourceTemplateId !== null;
    let items: AssignmentBlueprint['items'] | undefined;
    let rubric: AssignmentBlueprint['rubric'] | undefined;

    if (hasContentPatch) {
      const counts = (await this.assignments.findCounts([assignmentId])).get(assignmentId)!;
      if (!isAssignmentContentUnlocked(current.status, counts.submissionCount > 0)) {
        throw new ConflictException(API_ERROR.ASSIGNMENT_CONTENT_LOCKED);
      }
      if (body.items !== undefined && isTemplateCopy) {
        throw new ConflictException(API_ERROR.ASSIGNMENT_CONTENT_LOCKED);
      }
      const currentBlueprint = toAssignmentBlueprint(current);
      const candidate = parseAssignmentBlueprint({
        items: body.items ?? currentBlueprint.items,
        rubric: body.rubric === undefined ? currentBlueprint.rubric : body.rubric,
        allowResubmission: body.allowResubmission ?? current.allowResubmission,
      });
      if (
        isTemplateCopy &&
        body.rubric !== undefined &&
        (currentBlueprint.rubric === null || candidate.rubric === null)
      ) {
        throw new ConflictException(API_ERROR.ASSIGNMENT_CONTENT_LOCKED);
      }
      items = body.items === undefined ? undefined : candidate.items;
      rubric = body.rubric === undefined ? undefined : candidate.rubric;
    }

    try {
      const updated = await this.assignments.update(deliveryId, assignmentId, body, items, rubric);
      if (!updated) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      return this.toResponse(updated);
    } catch (error) {
      this.mapFreezeError(error);
      throw error;
    }
  }

  /** Deletes an assignment and its content only when no submission exists. */
  async delete(actor: AuthContext, deliveryId: string, assignmentId: string): Promise<void> {
    const delivery = await this.access.loadForRead(actor, deliveryId);
    await this.requireAssignment(deliveryId, assignmentId);
    await this.access.assertWriteEligibility(delivery);
    try {
      if (!(await this.assignments.deleteIfUnused(deliveryId, assignmentId))) {
        throw new ConflictException(API_ERROR.ASSIGNMENT_HAS_SUBMISSIONS);
      }
    } catch (error) {
      this.mapFreezeError(error);
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(API_ERROR.ASSIGNMENT_HAS_SUBMISSIONS);
      }
      throw error;
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

  /** Maps assignment detail and aggregates after an edit. */
  private async toResponse(assignment: AssignmentDetailRecord) {
    const counts = (await this.assignments.findCounts([assignment.id])).get(assignment.id)!;
    return toDeliveryAssignmentResponse(assignment, {
      ...counts,
      itemCount: assignment.items.length,
    });
  }

  /** Maps database freeze trigger failures to the service's stable content-lock response. */
  private mapFreezeError(error: unknown): void {
    const reason = getPrismaReason(error).toLowerCase();
    if (
      reason.includes('published assignments must be unpublished before editing') ||
      reason.includes('assignment_items are frozen after the first submission') ||
      reason.includes('assignment_item_options are frozen after the first submission') ||
      reason.includes('assignments rubric and anchor are frozen after the first submission')
    ) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_CONTENT_LOCKED);
    }
  }
}
