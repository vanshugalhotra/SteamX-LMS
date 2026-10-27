// Tests for block-tree paths and the rows created when saving a tree.
import { BlockType } from '../../../generated/prisma/enums.js';
import type { NormalizedBlock } from '../validation/types.js';
import { flattenBlocks, walkBlocks } from './walk-blocks.js';

/** Make a small valid rich-text block for the helper tests. */
const text = (id: string): NormalizedBlock => ({
  id,
  type: BlockType.RICH_TEXT,
  content: { format: 'tiptap', doc: { type: 'doc' } },
});

describe('lesson block persistence helpers', () => {
  it('walks top-level and column blocks using validator paths', () => {
    const blocks: NormalizedBlock[] = [
      text('block-1'),
      {
        id: 'layout',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [text('left'), null],
      },
      text('block-3'),
      {
        id: 'layout-2',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [null, text('right')],
      },
    ];
    const paths: string[] = [];

    walkBlocks(blocks, ({ path }) => paths.push(path));

    expect(paths).toEqual([
      'blocks[0]',
      'blocks[1]',
      'blocks[1].columns[0]',
      'blocks[2]',
      'blocks[3]',
      'blocks[3].columns[1]',
    ]);
  });

  it('flattens blocks into ordered top-level and sparse child rows', () => {
    const blocks: NormalizedBlock[] = [
      text('first'),
      {
        id: 'layout',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [text('left'), null],
      },
      {
        id: 'layout-2',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [text('left-2'), text('right-2')],
      },
    ];

    const flattened = flattenBlocks(blocks, 'lesson-id');

    expect(flattened.topLevel.map(({ id, position }) => [id, position])).toEqual([
      ['first', 1],
      ['layout', 2],
      ['layout-2', 3],
    ]);
    expect(flattened.topLevel.map(({ id }) => id)).toEqual(['first', 'layout', 'layout-2']);
    expect(flattened.topLevel[1]).toMatchObject({
      content: {},
      parentBlockId: null,
      columnIndex: null,
    });
    expect(
      flattened.children.map(({ id, parentBlockId, columnIndex, position }) => [
        id,
        parentBlockId,
        columnIndex,
        position,
      ]),
    ).toEqual([
      ['left', 'layout', 0, null],
      ['left-2', 'layout-2', 0, null],
      ['right-2', 'layout-2', 1, null],
    ]);
  });
});
