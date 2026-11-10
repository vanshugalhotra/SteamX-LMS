/** Merges template rubric text overrides without changing rubric presence or size. */
import { BadRequestException } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { parseAssignmentBlueprint } from '../blueprint/blueprint.validator.js';
import type { AssignmentBlueprint, AssignmentRubricItem } from '../blueprint/blueprint.schema.js';

/** Applies a full rubric text replacement while retaining the template's fixed rubric shape. */
export function mergeTemplateRubric(
  blueprint: AssignmentBlueprint,
  overrides: AssignmentRubricItem[] | undefined,
): AssignmentBlueprint {
  if (overrides === undefined) {
    return blueprint;
  }
  if (blueprint.rubric === null || overrides.length !== blueprint.rubric.length) {
    throw new BadRequestException(API_ERROR.VALIDATION_ERROR);
  }
  if (overrides.some((entry) => !Object.hasOwn(entry, 'description'))) {
    throw new BadRequestException(API_ERROR.VALIDATION_ERROR);
  }
  return parseAssignmentBlueprint({ ...blueprint, rubric: overrides });
}
