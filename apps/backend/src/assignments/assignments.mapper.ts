/** Maps shared assignment and grading constants to assignment API responses. */
import { GRADE_LEVELS } from '../grading/grade-scale.js';
import { ASSIGNMENT_LIMITS, DEFAULT_RUBRIC, RUBRIC_SIZE } from './blueprint/constants.js';
import type { AssignmentDefaultsResponseDto } from './dto/assignment-defaults-response.dto.js';

/** Builds the defaults response using copies of nested constants. */
export function toAssignmentDefaultsResponse(): AssignmentDefaultsResponseDto {
  return {
    rubric: {
      size: RUBRIC_SIZE,
      categories: DEFAULT_RUBRIC.map(({ name, description }) => ({ name, description })),
    },
    gradeLevels: GRADE_LEVELS.map(({ code, letter }) => ({ code, letter })),
    limits: {
      maxItems: ASSIGNMENT_LIMITS.maxItems,
      titleMaxLength: ASSIGNMENT_LIMITS.titleMaxLength,
      descriptionMaxLength: ASSIGNMENT_LIMITS.descriptionMaxLength,
      promptMaxLength: ASSIGNMENT_LIMITS.promptMaxLength,
      options: { ...ASSIGNMENT_LIMITS.options },
      rubric: { ...ASSIGNMENT_LIMITS.rubric },
      text: { ...ASSIGNMENT_LIMITS.text },
      fileUpload: {
        minFiles: ASSIGNMENT_LIMITS.fileUpload.minFiles,
        maxFiles: ASSIGNMENT_LIMITS.fileUpload.maxFiles,
        minSizeMb: ASSIGNMENT_LIMITS.fileUpload.minSizeMb,
        maxSizeMb: ASSIGNMENT_LIMITS.fileUpload.maxSizeMb,
        allowedTypes: [...ASSIGNMENT_LIMITS.fileUpload.allowedTypes],
      },
    },
  };
}
