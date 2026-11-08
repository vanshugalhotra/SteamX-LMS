/** Maps template records to safe summary and admin detail response DTOs. */
import type { AssignmentTemplate } from '../../generated/prisma/client.js';
import type {
  AssignmentBlueprint,
  AssignmentBlueprintItem,
  AssignmentItemType,
  AssignmentRubricItem,
  FileUploadType,
} from '../blueprint/constants.js';
import { ASSIGNMENT_ITEM_TYPE, FILE_UPLOAD_TYPE } from '../blueprint/constants.js';
import type {
  AssignmentTemplateResponseDto,
  AssignmentTemplateSummaryDto,
} from './dto/assignment-template.dto.js';

/** Maps computed blueprint metadata without including the blueprint itself. */
export function toAssignmentTemplateSummary(
  template: AssignmentTemplate,
): AssignmentTemplateSummaryDto {
  const blueprint = readAssignmentBlueprint(template.blueprint);
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

/** Maps the full record, including answer-key fields for permission-protected reads. */
export function toAssignmentTemplateResponse(
  template: AssignmentTemplate,
): AssignmentTemplateResponseDto {
  const blueprint = readAssignmentBlueprint(template.blueprint);
  const summary = toAssignmentTemplateSummary(template);
  return {
    id: summary.id,
    courseId: summary.courseId,
    moduleId: summary.moduleId,
    lessonId: summary.lessonId,
    title: summary.title,
    status: summary.status,
    itemCount: summary.itemCount,
    itemTypes: summary.itemTypes,
    hasRubric: summary.hasRubric,
    allowResubmission: summary.allowResubmission,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    description: template.description,
    createdById: template.createdById,
    blueprint,
  };
}

/** Returns the blueprint item types once each, preserving first-seen order. */
function uniqueItemTypes(blueprint: AssignmentBlueprint): AssignmentItemType[] {
  return [...new Set(blueprint.items.map((item) => item.type))];
}

/** Reads persisted JSON only after verifying it has the blueprint response shape. */
export function readAssignmentBlueprint(value: unknown): AssignmentBlueprint {
  if (!isAssignmentBlueprint(value)) {
    throw new Error(
      'Stored assignment template blueprint does not match the assignment blueprint shape.',
    );
  }
  return value;
}

/** Narrows JSON read from the database to the shared blueprint type. */
function isAssignmentBlueprint(value: unknown): value is AssignmentBlueprint {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !(value.rubric === null || isRubric(value.rubric)) ||
    typeof value.allowResubmission !== 'boolean'
  ) {
    return false;
  }
  return value.items.every(isBlueprintItem);
}

/** Checks a persisted rubric array. */
function isRubric(value: unknown): value is AssignmentRubricItem[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!isRecord(item) || typeof item.name !== 'string') {
        return false;
      }
      return (
        item.description === undefined ||
        item.description === null ||
        typeof item.description === 'string'
      );
    })
  );
}

/** Checks the JSON types used by a persisted blueprint item. */
function isBlueprintItem(value: unknown): value is AssignmentBlueprintItem {
  if (!isRecord(value) || !isAssignmentItemType(value.type) || typeof value.prompt !== 'string') {
    return false;
  }
  if (
    value.options !== undefined &&
    (!Array.isArray(value.options) ||
      !value.options.every(
        (option) =>
          isRecord(option) &&
          typeof option.text === 'string' &&
          typeof option.isCorrect === 'boolean',
      ))
  ) {
    return false;
  }
  if (value.config !== undefined && !isBlueprintConfig(value.config)) {
    return false;
  }
  return true;
}

/** Checks optional text and file-upload configuration field types. */
function isBlueprintConfig(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.maxLength === undefined || typeof value.maxLength === 'number') &&
    (value.maxFiles === undefined || typeof value.maxFiles === 'number') &&
    (value.maxSizeMb === undefined || typeof value.maxSizeMb === 'number') &&
    (value.allowedTypes === undefined ||
      (Array.isArray(value.allowedTypes) && value.allowedTypes.every(isFileUploadType)))
  );
}

/** Checks a persisted item type without trusting JSON values. */
function isAssignmentItemType(value: unknown): value is AssignmentItemType {
  return Object.values(ASSIGNMENT_ITEM_TYPE).some((itemType) => itemType === value);
}

/** Checks a persisted upload type without trusting JSON values. */
function isFileUploadType(value: unknown): value is FileUploadType {
  return Object.values(FILE_UPLOAD_TYPE).some((fileType) => fileType === value);
}

/** Identifies a non-array object from untrusted JSON. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
