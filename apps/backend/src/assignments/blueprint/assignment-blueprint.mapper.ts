/** Maps persisted assignment items to the canonical validated blueprint shape. */
import { AssignmentBlueprintSchema } from './blueprint.schema.js';
import type { AssignmentBlueprint } from './blueprint.schema.js';

type BlueprintRecord = {
  allowResubmission: boolean;
  rubric: unknown;
  items: {
    type: string;
    prompt: string;
    config: unknown;
    options: { text: string; isCorrect: boolean }[];
  }[];
};

/** Converts ordered assignment rows to the same blueprint shape used by template validation. */
export function toAssignmentBlueprint(record: BlueprintRecord): AssignmentBlueprint {
  return AssignmentBlueprintSchema.parse({
    allowResubmission: record.allowResubmission,
    rubric: record.rubric,
    items: record.items.map((item) => ({
      type: item.type,
      prompt: item.prompt,
      ...(item.config === null ? {} : { config: item.config }),
      ...(item.options.length === 0
        ? {}
        : {
            options: item.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
          }),
    })),
  });
}
