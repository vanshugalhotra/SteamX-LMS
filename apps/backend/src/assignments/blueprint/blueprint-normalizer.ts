/** Copies validated request DTOs into the canonical JSON blueprint representation. */
import type { AssignmentBlueprint } from './constants.js';
import type { AssignmentBlueprintDto } from './blueprint.dto.js';

/** Returns the standard empty blueprint used when creation omits one. */
export function emptyBlueprint(): AssignmentBlueprint {
  return { items: [], rubric: null, allowResubmission: false };
}

/** Removes omitted fields and copies validated nested DTO values into JSON data. */
export function normalizeBlueprint(dto: AssignmentBlueprintDto): AssignmentBlueprint {
  return {
    items: dto.items.map((item) => ({
      type: item.type,
      prompt: item.prompt,
      ...(item.config === undefined
        ? {}
        : {
            config: {
              ...(item.config.maxLength === undefined ? {} : { maxLength: item.config.maxLength }),
              ...(item.config.maxFiles === undefined ? {} : { maxFiles: item.config.maxFiles }),
              ...(item.config.maxSizeMb === undefined ? {} : { maxSizeMb: item.config.maxSizeMb }),
              ...(item.config.allowedTypes === undefined
                ? {}
                : { allowedTypes: [...item.config.allowedTypes] }),
            },
          }),
      ...(item.options === undefined
        ? {}
        : { options: item.options.map(({ text, isCorrect }) => ({ text, isCorrect })) }),
    })),
    rubric:
      dto.rubric === null
        ? null
        : dto.rubric.map(({ name, description }) => ({
            name,
            ...(description === undefined ? {} : { description }),
          })),
    allowResubmission: dto.allowResubmission,
  };
}
