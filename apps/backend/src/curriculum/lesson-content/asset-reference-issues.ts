// Checks whether assets in a lesson tree can be referenced by this save.
import { ContentStatus } from '../../generated/prisma/enums.js';
import { blockDefinitions } from './block-definitions/registry.js';
import type { AssetSummary } from '../../assets/assets.types.js';
import type { Issue, NormalizedBlock } from './validation/types.js';
import { walkBlocks } from './tree/walk-blocks.js';

/** Return one issue per invalid asset reference, with the block's request path. */
export function findAssetReferenceIssues(
  blocks: NormalizedBlock[],
  summaries: Map<string, AssetSummary>,
  existingAssetIds: ReadonlySet<string>,
): Issue[] {
  const issues: Issue[] = [];

  // An asset already used by this lesson stays allowed even if its status later changes.
  walkBlocks(blocks, ({ block, path }) => {
    if (!block.assetId) return;
    const summary = summaries.get(block.assetId);
    if (!summary) {
      issues.push({
        path: `${path}.assetId`,
        code: 'ASSET_NOT_FOUND',
        message: 'The referenced asset does not exist.',
      });
      return;
    }

    const expectedType = blockDefinitions[block.type]?.assetType;
    if (expectedType && summary.type !== expectedType) {
      issues.push({
        path: `${path}.assetId`,
        code: 'ASSET_TYPE_MISMATCH',
        message: 'The referenced asset type does not match this block.',
      });
    }

    if (existingAssetIds.has(block.assetId)) return;
    if (summary.status === ContentStatus.ARCHIVED) {
      issues.push({
        path: `${path}.assetId`,
        code: 'ASSET_ARCHIVED',
        message: 'New references to archived assets are not allowed.',
      });
    }
    if (summary.file?.status !== 'READY') {
      issues.push({
        path: `${path}.assetId`,
        code: 'ASSET_NOT_READY',
        message: 'The referenced asset does not have a READY file.',
      });
    }
  });

  return issues;
}
