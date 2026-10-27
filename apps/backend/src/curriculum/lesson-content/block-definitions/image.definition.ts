import { AssetType } from '../../../generated/prisma/enums.js';
import type { BlockDefinition } from '../validation/types.js';
import { optionalText, recordContent, rejectUnknownFields } from '../validation/helpers.js';

export const imageDefinition: BlockDefinition = {
  assetType: AssetType.IMAGE,
  allowedInColumn: true,
  validateContent: (input, path, issues) => {
    const source = recordContent(input, path, issues);
    rejectUnknownFields(source, ['alt', 'caption'], path, issues);
    const result: Record<string, unknown> = {};
    if (source.alt !== undefined) {
      const alt = optionalText(source.alt, `${path}.alt`, 300, issues);
      if (alt !== undefined) result.alt = alt;
    }
    if (source.caption !== undefined) {
      const caption = optionalText(source.caption, `${path}.caption`, 300, issues);
      if (caption !== undefined) result.caption = caption;
    }
    return result;
  },
};
