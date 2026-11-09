/** Handles request-shape errors and publish-readiness checks. */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { ASSIGNMENT_ITEM_TYPE } from './constants.js';
import { AssignmentBlueprintSchema } from './blueprint.schema.js';
import type { AssignmentBlueprint } from './blueprint.schema.js';

export interface BlueprintProblem {
  path: string;
  rule: string;
  message: string;
}

/** Parses request JSON and maps shape errors to the standard validation response. */
export function parseAssignmentBlueprint(value: unknown): AssignmentBlueprint {
  const parsed = AssignmentBlueprintSchema.safeParse(value);
  if (!parsed.success) {
    const errorsByField = new Map<string, string[]>();
    for (const issue of parsed.error.issues) {
      const field = ['blueprint', ...issue.path].map(String).join('.');
      const errors = errorsByField.get(field) ?? [];
      if (!errors.includes(issue.message)) {
        errors.push(issue.message);
      }
      errorsByField.set(field, errors);
    }
    throw new BadRequestException({
      ...API_ERROR.VALIDATION_ERROR,
      details: [...errorsByField].map(([field, errors]) => ({ field, errors })),
    });
  }
  return parsed.data;
}

/** Collects every publish rule violation and throws one structured conflict. */
export function assertPublishableBlueprint(blueprint: AssignmentBlueprint): void {
  const problems: BlueprintProblem[] = [];

  if (!Array.isArray(blueprint.items) || blueprint.items.length === 0) {
    problems.push({
      path: 'items',
      rule: 'minItems',
      message: 'At least one item is required',
    });
  }

  const items = Array.isArray(blueprint.items) ? blueprint.items : [];
  const singleChoiceIndexes = items.flatMap((item, index) =>
    item.type === ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE ? [index] : [],
  );

  for (const [index, item] of items.entries()) {
    if (item.type !== ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE) {
      continue;
    }
    const options = Array.isArray(item.options) ? item.options : [];
    const optionPath = `items.${index}.options`;
    if (options.length < 2) {
      problems.push({
        path: optionPath,
        rule: 'minOptions',
        message: 'A single-choice item requires at least two options',
      });
    }
    if (options.filter(isCorrectOption).length !== 1) {
      problems.push({
        path: optionPath,
        rule: 'exactlyOneCorrect',
        message: 'A single-choice item requires exactly one correct option',
      });
    }
  }

  if (singleChoiceIndexes.length > 0 && singleChoiceIndexes.length !== items.length) {
    problems.push({
      path: 'items',
      rule: 'homogeneousTypes',
      message: 'A blueprint must contain only single-choice items or no single-choice items',
    });
  }

  if (singleChoiceIndexes.length > 0 && blueprint.rubric !== null) {
    problems.push({
      path: 'rubric',
      rule: 'rubricNotAllowed',
      message: 'Rubrics are not allowed when the blueprint contains single-choice items',
    });
  }

  if (problems.length > 0) {
    throw new ConflictException({
      ...API_ERROR.ASSIGNMENT_BLUEPRINT_INVALID,
      details: problems,
    });
  }
}

/** Checks that a candidate option explicitly marks itself correct. */
function isCorrectOption(value: { isCorrect: boolean }): boolean {
  return value.isCorrect;
}
