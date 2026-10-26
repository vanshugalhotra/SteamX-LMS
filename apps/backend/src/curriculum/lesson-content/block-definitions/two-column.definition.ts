import type { BlockDefinition } from '../types.js';
import { recordContent, rejectUnknownFields } from './validation-helpers.js';

export const twoColumnDefinition: BlockDefinition = {
  allowedInColumn: false,
  validateContent: (input, path, issues) => {
    const source = recordContent(input, path, issues);
    rejectUnknownFields(source, [], path, issues);
    return {};
  },
};
