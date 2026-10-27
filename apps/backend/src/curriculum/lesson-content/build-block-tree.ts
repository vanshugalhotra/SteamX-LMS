import { BlockType } from '../../generated/prisma/enums.js';
import type { NormalizedBlock } from './types.js';

export type LessonContentBlockRow = {
  id: string;
  type: BlockType;
  assetId: string | null;
  content: unknown;
  position: number | null;
  parentBlockId: string | null;
  columnIndex: number | null;
};

function isContentObject(content: unknown): content is Record<string, unknown> {
  return typeof content === 'object' && content !== null && !Array.isArray(content);
}

function toBlock(row: LessonContentBlockRow): NormalizedBlock {
  if (!isContentObject(row.content)) {
    throw new Error(`Lesson block ${row.id} has non-object content.`);
  }
  // Copy only fields allowed in the API response; database ordering and parent fields stay private.
  return {
    id: row.id,
    type: row.type,
    ...(row.assetId === null ? {} : { assetId: row.assetId }),
    content: row.content,
  };
}

/** Turns database rows into the block tree returned by the API. */
export function buildBlockTree(rows: LessonContentBlockRow[]): NormalizedBlock[] {
  // Keep one block per ID so column children can be attached without copying or returning them twice.
  const blocksById = new Map(rows.map((row) => [row.id, toBlock(row)]));
  // Only top-level blocks have a position, which defines the order shown to the client.
  const topRows = rows
    .filter((row) => row.parentBlockId === null)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

  // Group children by their parent layout so each TWO_COLUMN can find its own entries.
  const childrenByParent = new Map<string, LessonContentBlockRow[]>();
  for (const row of rows) {
    if (row.parentBlockId === null) continue;
    const siblings = childrenByParent.get(row.parentBlockId) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parentBlockId, siblings);
  }

  for (const row of topRows) {
    const block = blocksById.get(row.id);
    if (block?.type !== BlockType.TWO_COLUMN) continue;
    const children = childrenByParent.get(row.id) ?? [];
    // Column index sets the slot; a missing child stays null.
    const byColumn = new Map(
      children.map((child) => [child.columnIndex, blocksById.get(child.id)!]),
    );
    block.columns = [byColumn.get(0) ?? null, byColumn.get(1) ?? null];
  }

  return topRows.map((row) => {
    const block = blocksById.get(row.id);
    if (!block) throw new Error(`Lesson block ${row.id} was not materialized.`);
    return block;
  });
}
