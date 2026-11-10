import { describe, expect, it } from 'vitest';
import { toAssignmentBlueprint } from './assignment-blueprint.mapper.js';

describe('toAssignmentBlueprint', () => {
  it('maps ordered rows and nullable fields to the canonical blueprint shape', () => {
    expect(
      toAssignmentBlueprint({
        allowResubmission: true,
        rubric: [
          { name: 'Knowledge', description: null },
          { name: 'Thinking', description: null },
          { name: 'Application', description: null },
          { name: 'Communication', description: null },
        ],
        items: [
          {
            type: 'SINGLE_CHOICE',
            prompt: 'Choose one',
            config: null,
            options: [
              { text: 'Wrong', isCorrect: false },
              { text: 'Right', isCorrect: true },
            ],
          },
          {
            type: 'TEXT',
            prompt: 'Explain',
            config: { maxLength: 300 },
            options: [],
          },
        ],
      }),
    ).toEqual({
      allowResubmission: true,
      rubric: [
        { name: 'Knowledge', description: null },
        { name: 'Thinking', description: null },
        { name: 'Application', description: null },
        { name: 'Communication', description: null },
      ],
      items: [
        {
          type: 'SINGLE_CHOICE',
          prompt: 'Choose one',
          options: [
            { text: 'Wrong', isCorrect: false },
            { text: 'Right', isCorrect: true },
          ],
        },
        { type: 'TEXT', prompt: 'Explain', config: { maxLength: 300 } },
      ],
    });
  });
});
