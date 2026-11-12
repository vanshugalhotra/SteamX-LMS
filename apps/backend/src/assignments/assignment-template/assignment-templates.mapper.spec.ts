/** Verifies persisted blueprint JSON is parsed with the shared schema. */
import { readAssignmentBlueprint } from './assignment-templates.mapper.js';

describe('readAssignmentBlueprint', () => {
  it('applies schema defaults and normalization when reading valid JSON', () => {
    expect(
      readAssignmentBlueprint({
        items: [{ type: 'TEXT', prompt: '  Explain your answer.  ' }],
        rubric: null,
      }),
    ).toEqual({
      items: [{ type: 'TEXT', prompt: 'Explain your answer.' }],
      rubric: null,
      allowResubmission: false,
    });
  });

  it.each([
    [
      'too many options',
      {
        items: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Choose one.',
            options: Array.from({ length: 7 }, (_, index) => ({
              text: `Option ${index}`,
              isCorrect: index === 0,
            })),
          },
        ],
        rubric: null,
        allowResubmission: false,
      },
    ],
    [
      'unknown fields',
      {
        items: [],
        rubric: null,
        allowResubmission: false,
        extra: true,
      },
    ],
  ])('rejects invalid stored JSON (%s)', (_label, value) => {
    expect(() => readAssignmentBlueprint(value)).toThrow(
      'Stored assignment template blueprint is invalid.',
    );
  });
});
