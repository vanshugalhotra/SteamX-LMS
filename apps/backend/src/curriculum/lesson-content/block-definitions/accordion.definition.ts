import { MAX_TITLE } from '../limits.js';
import { normalizeRichText } from '../rich-text/tiptap-normalizer.js';
import type { BlockDefinition } from '../types.js';
import { addIssue, recordContent, rejectUnknownFields } from './validation-helpers.js';

export const accordionDefinition: BlockDefinition = {
  allowedInColumn: true,
  validateContent: (input, path, issues) => {
    const source = recordContent(input, path, issues);
    rejectUnknownFields(source, ['title', 'body'], path, issues);
    let title = '';
    if (typeof source.title !== 'string') {
      addIssue(issues, `${path}.title`, 'INVALID_CONTENT', 'Accordion title is required.');
    } else {
      title = source.title.trim();
      if (!title || title.length > MAX_TITLE) {
        addIssue(
          issues,
          `${path}.title`,
          title ? 'TOO_LONG' : 'INVALID_CONTENT',
          'Accordion title must contain 1 to 200 characters.',
        );
      }
    }
    return { title, body: normalizeRichText(source.body, `${path}.body`, issues) };
  },
};
