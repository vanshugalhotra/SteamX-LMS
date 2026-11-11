/** Maps assignment records to summary and teacher-visible detail responses. */
import type {
  DeliveryAssignmentItemResponseDto,
  DeliveryAssignmentResponseDto,
  DeliveryAssignmentSummaryDto,
} from '../dto/delivery-assignment-response.dto.js';
import type {
  AssignmentDetailRecord,
  AssignmentListRecord,
} from './delivery-assignments.repository.js';
import { toAssignmentBlueprint } from '../blueprint/assignment-blueprint.mapper.js';
import { isAssignmentContentEditable } from './assignment-editability.js';

export type AssignmentCounts = {
  itemCount: number;
  submissionCount: number;
  gradedCount: number;
};

/** Maps one list record with page-level grouped counts. */
export function toDeliveryAssignmentSummary(
  assignment: AssignmentListRecord,
  counts: AssignmentCounts,
): DeliveryAssignmentSummaryDto {
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignment.status,
    dueAt: assignment.dueAt,
    moduleId: assignment.moduleId,
    lessonId: assignment.lessonId,
    allowResubmission: assignment.allowResubmission,
    hasRubric: assignment.rubric !== null,
    ...counts,
    publishedAt: assignment.publishedAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

/** Maps a full record while omitting answer keys from template-derived copies. */
export function toDeliveryAssignmentResponse(
  assignment: AssignmentDetailRecord,
  counts: AssignmentCounts,
): DeliveryAssignmentResponseDto {
  const blueprint = toAssignmentBlueprint(assignment);
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignment.status,
    dueAt: assignment.dueAt,
    moduleId: assignment.moduleId,
    lessonId: assignment.lessonId,
    allowResubmission: assignment.allowResubmission,
    hasRubric: assignment.rubric !== null,
    ...counts,
    publishedAt: assignment.publishedAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    description: assignment.description,
    rubric: blueprint.rubric,
    items: assignment.items.map((item) =>
      toItemResponse(item, assignment.sourceTemplateId === null),
    ),
    contentEditable: isAssignmentContentEditable(
      assignment.status,
      counts.submissionCount > 0,
      assignment.sourceTemplateId !== null,
    ),
  };
}

/** Maps item rows and includes correctness only for assignments authored directly by teachers. */
function toItemResponse(
  item: AssignmentDetailRecord['items'][number],
  includeCorrectness: boolean,
): DeliveryAssignmentItemResponseDto {
  return {
    id: item.id,
    position: item.position,
    type: item.type,
    prompt: item.prompt,
    config: item.config,
    options: item.options.map((option) => ({
      id: option.id,
      position: option.position,
      text: option.text,
      ...(includeCorrectness ? { isCorrect: option.isCorrect } : {}),
    })),
  };
}
