import { describe, expect, it } from 'vitest';
import {
  GRADE_LEVELS,
  R_PERCENT,
  averagePercent,
  gradeFromPercent,
  isLevelCode,
  levelToPercent,
  mcqPercent,
  percentToLevel,
  rubricLevelsToPercent,
} from './grade-scale.js';

describe('grade scale', () => {
  it.each(GRADE_LEVELS)('maps midpoint for $code back to its level', ({ code, midpoint }) => {
    expect(percentToLevel(midpoint).code).toBe(code);
    expect(levelToPercent(code)).toBe(midpoint);
  });

  it.each([
    [100, '4+'],
    [95, '4+'],
    [94.99, '4'],
    [94.6, '4'],
    [86, '4'],
    [85.99, '4-'],
    [85.5, '4-'],
    [80, '4-'],
    [79.5, '3+'],
    [77, '3+'],
    [76.99, '3'],
    [50, '1-'],
    [49.99, 'R'],
    [49.9, 'R'],
    [0, 'R'],
  ] as const)('maps %s percent to level %s', (percent, code) => {
    expect(percentToLevel(percent).code).toBe(code);
  });

  it.each([-0.1, 100.01, Number.NaN])('rejects invalid percent %s', (percent) => {
    expect(() => percentToLevel(percent)).toThrow(RangeError);
  });

  it('averages rubric levels and rounds only the final result', () => {
    expect(rubricLevelsToPercent(['4+', '4+', '4+', '4+'])).toBe(97.5);
    expect(rubricLevelsToPercent(['4', '4', '3', '3'])).toBe(82.25);
    expect(gradeFromPercent(rubricLevelsToPercent(['4', '4', '3', '3']))).toMatchObject({
      level: '4-',
    });

    const mixedLevelsPercent = (levelToPercent('4+') * 3 + R_PERCENT) / 4;
    const mixedLevelsRounded = Math.round(mixedLevelsPercent * 100) / 100;
    expect(rubricLevelsToPercent(['4+', '4+', '4+', 'R'])).toBe(mixedLevelsRounded);
    expect(percentToLevel(mixedLevelsRounded).code).toBe('3+');
  });

  it('rejects an empty rubric level list', () => {
    expect(() => rubricLevelsToPercent([])).toThrow(RangeError);
  });

  it('accepts all level codes and rejects other values', () => {
    for (const { code } of GRADE_LEVELS) {
      expect(isLevelCode(code)).toBe(true);
    }

    for (const value of ['5', 'R+', '', null]) {
      expect(isLevelCode(value)).toBe(false);
    }
  });

  it('averages percentages and returns null for an empty list', () => {
    expect(averagePercent([])).toBeNull();
    expect(averagePercent([90, 74.5])).toBe(82.25);
    expect(averagePercent([82.25])).toBe(82.25);
  });

  it.each([
    [7, 9, 77.78],
    [0, 5, 0],
    [5, 5, 100],
  ])('converts %s of %s correct answers to %s percent', (correct, total, expected) => {
    expect(mcqPercent(correct, total)).toBe(expected);
  });

  it('rejects invalid MCQ totals and correct-answer counts', () => {
    expect(() => mcqPercent(0, 0)).toThrow(RangeError);
    expect(() => mcqPercent(6, 5)).toThrow(RangeError);
    expect(() => mcqPercent(-1, 5)).toThrow(RangeError);
  });
});
