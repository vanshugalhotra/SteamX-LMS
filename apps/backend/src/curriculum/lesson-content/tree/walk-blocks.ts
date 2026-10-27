// Helpers for walking the block tree and turning it into database rows.
import type { NormalizedBlock } from '../validation/types.js';
import type { Prisma } from '../../../generated/prisma/client.js';

/** A block together with its location in the request tree. */
export type BlockWithPath = { block: NormalizedBlock; path: string };

/** Visit each block once and report paths in the same format as validation errors. */
export function walkBlocks(blocks: NormalizedBlock[], visit: (entry: BlockWithPath) => void): void {
  // Visit a block and then its filled columns, building the path as we go.
  function walk(block: NormalizedBlock, path: string): void {
    visit({ block, path });
    if (!block.columns) return;
    for (const [columnIndex, child] of block.columns.entries()) {
      if (child) walk(child, `${path}.columns[${columnIndex}]`);
    }
  }

  blocks.forEach((block, index) => walk(block, `blocks[${index}]`));
}

export type LessonBlockCreateData = {
  id: string;
  lessonId: string;
  type: NormalizedBlock['type'];
  assetId: string | null;
  content: Prisma.InputJsonValue;
  position: number | null;
  parentBlockId: string | null;
  columnIndex: number | null;
};

/** Split the tree into parent rows and child rows ready for Prisma createMany. */
export function flattenBlocks(
  blocks: NormalizedBlock[],
  lessonId: string,
): { topLevel: LessonBlockCreateData[]; children: LessonBlockCreateData[] } {
  const topLevel: LessonBlockCreateData[] = [];
  const children: LessonBlockCreateData[] = [];

  blocks.forEach((block, index) => {
    topLevel.push(toCreateData(block, lessonId, index + 1, null, null));
    block.columns?.forEach((child, columnIndex) => {
      if (child) children.push(toCreateData(child, lessonId, null, block.id, columnIndex));
    });
  });

  return { topLevel, children };
}

/** Map one block to the database fields used by createMany. */
function toCreateData(
  block: NormalizedBlock,
  lessonId: string,
  position: number | null,
  parentBlockId: string | null,
  columnIndex: number | null,
): LessonBlockCreateData {
  return {
    id: block.id,
    lessonId,
    type: block.type,
    assetId: block.assetId ?? null,
    content: block.content as Prisma.InputJsonValue,
    position,
    parentBlockId,
    columnIndex,
  };
}
