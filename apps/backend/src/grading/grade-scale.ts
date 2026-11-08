/**
 * Grade levels use lower-bound thresholds so decimal percentages never fall between ranges.
 * A level's value is the midpoint of its range; averages are rounded once, at the end, to 2 decimals.
 */
export const R_PERCENT = 25; // The client has not confirmed the value for R yet; change only this constant.

export const GRADE_LEVELS = [
  { code: '4+', min: 95, midpoint: 97.5, letter: 'A+' },
  { code: '4', min: 86, midpoint: 90, letter: 'A' },
  { code: '4-', min: 80, midpoint: 82.5, letter: 'A-' },
  { code: '3+', min: 77, midpoint: 78, letter: 'B+' },
  { code: '3', min: 73, midpoint: 74.5, letter: 'B' },
  { code: '3-', min: 70, midpoint: 71, letter: 'B-' },
  { code: '2+', min: 67, midpoint: 68, letter: 'C+' },
  { code: '2', min: 63, midpoint: 64.5, letter: 'C' },
  { code: '2-', min: 60, midpoint: 61, letter: 'C-' },
  { code: '1+', min: 57, midpoint: 58, letter: 'D+' },
  { code: '1', min: 53, midpoint: 54.5, letter: 'D' },
  { code: '1-', min: 50, midpoint: 51, letter: 'D-' },
  { code: 'R', min: 0, midpoint: R_PERCENT, letter: 'F' },
] as const;

export type LevelCode = (typeof GRADE_LEVELS)[number]['code'];

/** Rounds a calculated value once to two decimal places. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Checks whether an unknown value is a grade level code. */
export function isLevelCode(value: unknown): value is LevelCode {
  return GRADE_LEVELS.some((level) => level.code === value);
}

/** Returns the midpoint percentage assigned to a grade level. */
export function levelToPercent(code: LevelCode): number {
  return GRADE_LEVELS.find((level) => level.code === code)!.midpoint;
}

/** Maps a percentage to the first grade level whose lower bound it meets. */
export function percentToLevel(percent: number): {
  code: LevelCode;
  letter: (typeof GRADE_LEVELS)[number]['letter'];
} {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError('Percent must be a finite number from 0 to 100.');
  }

  const level = GRADE_LEVELS.find((candidate) => candidate.min <= percent);
  if (!level) {
    throw new RangeError('Percent must be a finite number from 0 to 100.');
  }
  return { code: level.code, letter: level.letter };
}

/** Averages grade-level midpoints and rounds the final result to two decimals. */
export function rubricLevelsToPercent(levels: LevelCode[]): number {
  if (levels.length === 0) {
    throw new RangeError('At least one grade level is required.');
  }
  const total = levels.reduce((sum, level) => sum + levelToPercent(level), 0);
  return round2(total / levels.length);
}

/** Averages percentages, returning null when there are no values. */
export function averagePercent(percents: number[]): number | null {
  if (percents.length === 0) {
    return null;
  }
  const total = percents.reduce((sum, percent) => sum + percent, 0);
  return round2(total / percents.length);
}

/** Converts correct answers to a percentage and rounds the result to two decimals. */
export function mcqPercent(correct: number, total: number): number {
  if (total <= 0) {
    throw new RangeError('Total must be greater than zero.');
  }
  if (correct < 0 || correct > total) {
    throw new RangeError('Correct answers must be from 0 to total.');
  }
  return round2((correct / total) * 100);
}

/** Returns the rounded percentage together with its grade level and letter. */
export function gradeFromPercent(percent: number): {
  percent: number;
  level: LevelCode;
  letter: (typeof GRADE_LEVELS)[number]['letter'];
} {
  const { code, letter } = percentToLevel(percent);
  return { percent, level: code, letter };
}
