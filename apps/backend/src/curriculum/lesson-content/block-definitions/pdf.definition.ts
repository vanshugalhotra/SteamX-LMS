import { AssetType } from '../../../generated/prisma/enums.js';
import type { BlockDefinition } from '../validation/types.js';
import { optionalText, recordContent, rejectUnknownFields } from '../validation/helpers.js';

export const pdfDefinition: BlockDefinition = {
  assetType: AssetType.PDF,
  allowedInColumn: true,
  validateContent: (input, path, issues) => {
    const source = recordContent(input, path, issues);
    rejectUnknownFields(source, ['caption'], path, issues);
    const caption =
      source.caption === undefined
        ? undefined
        : optionalText(source.caption, `${path}.caption`, 300, issues);
    return caption === undefined ? {} : { caption };
  },
};
