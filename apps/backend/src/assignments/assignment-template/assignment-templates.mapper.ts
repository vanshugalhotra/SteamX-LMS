/** Maps template records to safe summary and admin detail response DTOs. */
import type { AssignmentTemplate } from '../../generated/prisma/client.js';
import { AssignmentBlueprintSchema } from '../blueprint/blueprint.schema.js';
import type { AssignmentBlueprint, AssignmentItemType } from '../blueprint/blueprint.schema.js';
import type {
  AssignmentTemplateResponseDto,
  AssignmentTemplateSummaryDto,
} from './dto/assignment-template-response.dto.js';

/** Maps computed blueprint metadata without including the blueprint itself. */
export function toAssignmentTemplateSummary(
  template: AssignmentTemplate,
): AssignmentTemplateSummaryDto {
  const blueprint = readAssignmentBlueprint(template.blueprint);
  return mapSummary(template, blueprint);
}

/** Maps the full record, including answer-key fields for permission-protected reads. */
export function toAssignmentTemplateResponse(
  template: AssignmentTemplate,
): AssignmentTemplateResponseDto {
  const blueprint = readAssignmentBlueprint(template.blueprint);
  const summary = mapSummary(template, blueprint);
  return {
    ...summary,
    description: template.description,
    createdById: template.createdById,
    blueprint,
  };
}

/** Builds summary metadata from a blueprint that has already been validated. */
function mapSummary(
  template: AssignmentTemplate,
  blueprint: AssignmentBlueprint,
): Omit<AssignmentTemplateSummaryDto, never> {
  return {
    id: template.id,
    courseId: template.courseId,
    moduleId: template.moduleId,
    lessonId: template.lessonId,
    title: template.title,
    status: template.status,
    itemCount: blueprint.items.length,
    itemTypes: uniqueItemTypes(blueprint),
    hasRubric: blueprint.rubric !== null,
    allowResubmission: blueprint.allowResubmission,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

/** Returns the blueprint item types once each, preserving first-seen order. */
function uniqueItemTypes(blueprint: AssignmentBlueprint): AssignmentItemType[] {
  return [...new Set(blueprint.items.map((item) => item.type))];
}

/** Reads persisted JSON only after validating it with the canonical blueprint schema. */
export function readAssignmentBlueprint(value: unknown): AssignmentBlueprint {
  const parsed = AssignmentBlueprintSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Stored assignment template blueprint is invalid.');
  }
  return parsed.data;
}
