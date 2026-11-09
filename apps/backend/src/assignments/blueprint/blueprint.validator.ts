/** Validates publish readiness and item-specific blueprint shape rules. */
import { ConflictException } from '@nestjs/common';
import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { ASSIGNMENT_ITEM_TYPE } from './constants.js';
import type { AssignmentBlueprint } from './constants.js';

export interface BlueprintProblem {
  path: string;
  rule: string;
  message: string;
}

/** Checks configuration and options permitted for an item type.*/
@ValidatorConstraint({ name: 'blueprintItemShape', async: false })
export class BlueprintItemShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const item = args.object as Record<string, unknown>;
    const config = item.config;
    const options = item.options;

    switch (item.type) {
      case ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE:
        return config === undefined && Array.isArray(options);
      case ASSIGNMENT_ITEM_TYPE.TEXT:
        return (
          options === undefined &&
          (config === undefined ||
            (isObject(config) &&
              typeof config.maxLength === 'number' &&
              Object.entries(config).every(
                ([key, value]) => key === 'maxLength' || value === undefined,
              )))
        );
      case ASSIGNMENT_ITEM_TYPE.FILE_UPLOAD:
        return (
          options === undefined &&
          isObject(config) &&
          config.maxFiles !== undefined &&
          config.maxSizeMb !== undefined &&
          config.allowedTypes !== undefined &&
          Object.keys(config).every((key) =>
            ['maxFiles', 'maxSizeMb', 'allowedTypes'].includes(key),
          )
        );
      default:
        return true;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const item = args.object as Record<string, unknown>;
    if (item.type === ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE) {
      return 'SINGLE_CHOICE items require options and do not allow config';
    }
    if (item.type === ASSIGNMENT_ITEM_TYPE.TEXT) {
      return 'TEXT items do not allow options and config may only contain maxLength';
    }
    if (item.type === ASSIGNMENT_ITEM_TYPE.FILE_UPLOAD) {
      return 'FILE_UPLOAD items require file upload config and do not allow options';
    }
    return `Item shape is invalid for ${String(item.type)}`;
  }
}

/** Limits each draft multiple-choice item to one marked correct option. */
@ValidatorConstraint({ name: 'maxOneCorrectOption', async: false })
export class MaxOneCorrectOptionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return !Array.isArray(value) || value.filter(isCorrectOption).length <= 1;
  }

  defaultMessage(): string {
    return 'At most one option may be marked correct';
  }
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

/** Checks a plain object without relying on untrusted properties. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks that a candidate option explicitly marks itself correct. */
function isCorrectOption(value: unknown): boolean {
  return isObject(value) && value.isCorrect === true;
}
