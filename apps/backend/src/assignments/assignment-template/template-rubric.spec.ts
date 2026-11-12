import { describe, expect, it } from 'vitest';
import type { AssignmentBlueprint } from '../blueprint/blueprint.schema.js';
import { mergeTemplateRubric } from './template-rubric.js';

const blueprint: AssignmentBlueprint = {
  items: [{ type: 'TEXT', prompt: 'Explain' }],
  rubric: [
    { name: 'One', description: 'old one' },
    { name: 'Two', description: 'old two' },
    { name: 'Three', description: null },
    { name: 'Four', description: null },
  ],
  allowResubmission: false,
};

describe('mergeTemplateRubric', () => {
  it('keeps template rubric values when no override is supplied', () => {
    expect(mergeTemplateRubric(blueprint, undefined)).toEqual(blueprint);
  });

  it('replaces only the rubric text and preserves its fixed shape', () => {
    expect(
      mergeTemplateRubric(blueprint, [
        { name: 'A', description: null },
        { name: 'B', description: 'updated' },
        { name: 'C', description: null },
        { name: 'D', description: null },
      ]),
    ).toMatchObject({
      items: blueprint.items,
      allowResubmission: false,
      rubric: [
        { name: 'A', description: null },
        { name: 'B', description: 'updated' },
        { name: 'C', description: null },
        { name: 'D', description: null },
      ],
    });
  });

  it('rejects adding a rubric to a template that has none', () => {
    expect(() =>
      mergeTemplateRubric({ ...blueprint, rubric: null }, [
        { name: 'A', description: null },
        { name: 'B', description: null },
        { name: 'C', description: null },
        { name: 'D', description: null },
      ]),
    ).toThrow();
  });
});
