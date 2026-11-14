/** Defines pure grading-mode selection, payload validation, and grade calculation. */
import { ItemType, type Prisma } from '../../generated/prisma/client.js';
import {
  isLevelCode,
  levelToPercent,
  rubricLevelsToPercent,
  type LevelCode,
} from '../../grading/grade-scale.js';

export const GRADE_MODE = {
  RUBRIC: 'RUBRIC',
  OVERALL: 'OVERALL',
  AUTO: 'AUTO',
} as const;

export type GradeMode = (typeof GRADE_MODE)[keyof typeof GRADE_MODE];
export type GradePayload = {
  level?: unknown;
  rubricLevels?: unknown;
};
export type GradeProblem = { field: string; rule: string };

/** Resolves grading behavior exclusively from stored assignment content. */
export function resolveGradeMode(
  rubric: Prisma.JsonValue | null,
  items: ReadonlyArray<{ type: ItemType }>,
): GradeMode {
  if (rubric !== null) {
    return GRADE_MODE.RUBRIC;
  }
  return items.every(({ type }) => type === ItemType.SINGLE_CHOICE)
    ? GRADE_MODE.AUTO
    : GRADE_MODE.OVERALL;
}

/** Collects every mode-specific grade payload problem without stopping at the first one. */
export function validateGradePayload(
  mode: GradeMode,
  payload: GradePayload,
  rubricLength: number,
): GradeProblem[] {
  if (mode === GRADE_MODE.AUTO) {
    return [];
  }

  const problems: GradeProblem[] = [];
  if (mode === GRADE_MODE.RUBRIC) {
    if (payload.level !== undefined) {
      problems.push({ field: 'level', rule: 'not_allowed_for_rubric' });
    }
    if (payload.rubricLevels === undefined) {
      problems.push({ field: 'rubricLevels', rule: 'required' });
      return problems;
    }
    if (!Array.isArray(payload.rubricLevels)) {
      problems.push({ field: 'rubricLevels', rule: 'must_be_an_array' });
      return problems;
    }
    if (payload.rubricLevels.length !== rubricLength) {
      problems.push({
        field: 'rubricLevels',
        rule: `must_contain_exactly_${rubricLength}_levels`,
      });
    }
    payload.rubricLevels.forEach((level, index) => {
      if (!isLevelCode(level)) {
        problems.push({ field: `rubricLevels[${index}]`, rule: 'invalid_level_code' });
      }
    });
    return problems;
  }

  if (payload.rubricLevels !== undefined) {
    problems.push({ field: 'rubricLevels', rule: 'not_allowed_without_rubric' });
  }
  if (payload.level === undefined) {
    problems.push({ field: 'level', rule: 'required' });
  } else if (!isLevelCode(payload.level)) {
    problems.push({ field: 'level', rule: 'invalid_level_code' });
  }
  return problems;
}

/** Computes the stored percent and rubric-level value for an already validated payload. */
export function computeGrade(
  mode: Exclude<GradeMode, typeof GRADE_MODE.AUTO>,
  payload: GradePayload,
): { percent: number; rubricLevels: LevelCode[] | null } {
  if (mode === GRADE_MODE.RUBRIC) {
    if (
      !Array.isArray(payload.rubricLevels) ||
      !payload.rubricLevels.every(isLevelCode) ||
      payload.rubricLevels.length === 0
    ) {
      throw new RangeError('A valid non-empty rubric level list is required.');
    }
    const rubricLevels = payload.rubricLevels;
    return { percent: rubricLevelsToPercent(rubricLevels), rubricLevels };
  }
  if (!isLevelCode(payload.level)) {
    throw new RangeError('A valid overall grade level is required.');
  }
  return { percent: levelToPercent(payload.level), rubricLevels: null };
}
