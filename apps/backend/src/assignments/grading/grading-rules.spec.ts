import { describe, expect, it } from 'vitest';
import { ItemType } from '../../generated/prisma/client.js';
import { R_PERCENT } from '../../grading/grade-scale.js';
import {
  computeGrade,
  GRADE_MODE,
  resolveGradeMode,
  validateGradePayload,
} from './grading-rules.js';

describe('assignment grading rules', () => {
  it('resolves rubric grading before inspecting item types', () => {
    expect(resolveGradeMode([], [{ type: ItemType.SINGLE_CHOICE }])).toBe(GRADE_MODE.RUBRIC);
  });

  it('auto-grades assignments made entirely of multiple-choice items', () => {
    expect(
      resolveGradeMode(null, [{ type: ItemType.SINGLE_CHOICE }, { type: ItemType.SINGLE_CHOICE }]),
    ).toBe(GRADE_MODE.AUTO);
  });

  it.each([
    [[ItemType.TEXT], GRADE_MODE.OVERALL],
    [[ItemType.TEXT, ItemType.FILE_UPLOAD], GRADE_MODE.OVERALL],
  ] as const)('uses overall grading for item types %s', (types, expected) => {
    expect(
      resolveGradeMode(
        null,
        types.map((type) => ({ type })),
      ),
    ).toBe(expected);
  });

  it('collects independent rubric payload problems together', () => {
    expect(
      validateGradePayload(
        GRADE_MODE.RUBRIC,
        { level: 'not-a-level', rubricLevels: ['4', 'bad', '3'] },
        4,
      ),
    ).toEqual([
      { field: 'level', rule: 'not_allowed_for_rubric' },
      { field: 'rubricLevels', rule: 'must_contain_exactly_4_levels' },
      { field: 'rubricLevels[1]', rule: 'invalid_level_code' },
    ]);
  });

  it.each([
    [{}, [{ field: 'rubricLevels', rule: 'required' }]],
    [{ rubricLevels: '4' }, [{ field: 'rubricLevels', rule: 'must_be_an_array' }]],
    [
      { level: '3' },
      [
        { field: 'level', rule: 'not_allowed_for_rubric' },
        { field: 'rubricLevels', rule: 'required' },
      ],
    ],
  ] as const)('validates required and mode-disallowed rubric fields', (payload, problems) => {
    expect(validateGradePayload(GRADE_MODE.RUBRIC, payload, 4)).toEqual(problems);
  });

  it.each([
    [{}, [{ field: 'level', rule: 'required' }]],
    [{ level: '5' }, [{ field: 'level', rule: 'invalid_level_code' }]],
    [
      { level: 'bad', rubricLevels: ['4'] },
      [
        { field: 'rubricLevels', rule: 'not_allowed_without_rubric' },
        { field: 'level', rule: 'invalid_level_code' },
      ],
    ],
  ] as const)('validates overall grading payload %j', (payload, problems) => {
    expect(validateGradePayload(GRADE_MODE.OVERALL, payload, 0)).toEqual(problems);
  });

  it('computes rubric and overall grade values', () => {
    expect(computeGrade(GRADE_MODE.RUBRIC, { rubricLevels: ['4', '4', '3', '3'] })).toEqual({
      percent: 82.25,
      rubricLevels: ['4', '4', '3', '3'],
    });
    expect(computeGrade(GRADE_MODE.OVERALL, { level: '3' })).toEqual({
      percent: 74.5,
      rubricLevels: null,
    });
    expect(computeGrade(GRADE_MODE.RUBRIC, { rubricLevels: ['4+', '4+', '4+', 'R'] }).percent).toBe(
      Math.round(((97.5 * 3 + R_PERCENT) / 4) * 100) / 100,
    );
  });
});
