/** Creates delivery assignment copies from active, same-course templates. */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContentStatus } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { isPrismaKnownError } from '../../common/errors/prisma-error.js';
import { readAssignmentBlueprint } from '../assignment-template/assignment-templates.mapper.js';
import { AssignmentTemplatesRepository } from '../assignment-template/assignment-templates.repository.js';
import { parseAssignmentBlueprint } from '../blueprint/blueprint.validator.js';
import { DeliveryAssignmentAccessService } from './delivery-assignment-access.service.js';
import type {
  CreateDeliveryAssignmentFromTemplateDto,
  DeliveryAssignmentResponseDto,
} from '../dto/delivery-assignment.dto.js';
import { toDeliveryAssignmentResponse } from './delivery-assignments.mapper.js';
import { DeliveryAssignmentsRepository } from './delivery-assignments.repository.js';
import type { AssignmentDetailRecord } from './delivery-assignments.repository.js';
import { mergeTemplateRubric } from '../assignment-template/template-rubric.js';

/** Applies the fixed-shape template-copy rules and translates the copy unique index. */
@Injectable()
export class AssignmentTemplateCopyService {
  constructor(
    private readonly access: DeliveryAssignmentAccessService,
    private readonly assignments: DeliveryAssignmentsRepository,
    private readonly templates: AssignmentTemplatesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AssignmentTemplateCopyService.name);
  }

  /** Copies an ACTIVE same-course template, applying only its supported metadata overrides. */
  async create(
    actor: AuthContext,
    deliveryId: string,
    body: CreateDeliveryAssignmentFromTemplateDto,
  ): Promise<DeliveryAssignmentResponseDto> {
    const delivery = await this.access.loadForWrite(actor, deliveryId);
    const template = await this.templates.findById(body.templateId);
    if (
      !template ||
      template.status !== ContentStatus.ACTIVE ||
      template.courseId !== delivery.courseId
    ) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    let blueprint = mergeTemplateRubric(readAssignmentBlueprint(template.blueprint), body.rubric);
    blueprint = parseAssignmentBlueprint({
      ...blueprint,
      allowResubmission: body.allowResubmission ?? blueprint.allowResubmission,
    });
    try {
      const assignment = await this.assignments.create({
        schoolId: delivery.schoolId,
        deliveryId: delivery.id,
        courseId: delivery.courseId,
        moduleId: template.moduleId,
        lessonId: template.lessonId,
        title: body.title ?? template.title,
        description: body.description === undefined ? template.description : body.description,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        createdById: actor.userId,
        blueprint,
        sourceTemplateId: template.id,
      });
      this.logger.info(
        { actorId: actor.userId, deliveryId, assignmentId: assignment.id, templateId: template.id },
        'Delivery assignment copied from template',
      );
      return this.toResponse(assignment);
    } catch (error) {
      if (isTemplateCopyDuplicate(error)) {
        throw new ConflictException(API_ERROR.TEMPLATE_ALREADY_PUBLISHED_TO_DELIVERY);
      }
      throw error;
    }
  }

  /** Maps the new assignment and page aggregates to the standard detail response. */
  private async toResponse(assignment: AssignmentDetailRecord) {
    const counts = (await this.assignments.findCounts([assignment.id])).get(assignment.id)!;
    return toDeliveryAssignmentResponse(assignment, {
      ...counts,
      itemCount: assignment.items.length,
    });
  }
}

/** Recognizes only the delivery/template partial unique index. */
function isTemplateCopyDuplicate(error: unknown): boolean {
  if (
    !isPrismaKnownError(error) ||
    error.code !== 'P2002' ||
    !error.meta ||
    typeof error.meta !== 'object'
  ) {
    return false;
  }
  const target = readProperty(error.meta, 'target');
  const adapter = readProperty(error.meta, 'driverAdapterError');
  const cause = readProperty(adapter, 'cause');
  const constraintName = readProperty(readProperty(cause, 'constraint'), 'index');
  const targets = [...(Array.isArray(target) ? target : [target]), constraintName].filter(
    (value): value is string => typeof value === 'string',
  );
  return targets.some((value) => {
    const normalized = value.toLowerCase().replaceAll('_', '');
    return normalized.includes('delivery') && normalized.includes('sourcetemplate');
  });
}

/** Reads one property from untrusted Prisma adapter metadata. */
function readProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
