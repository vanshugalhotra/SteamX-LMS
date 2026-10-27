import { BlockType } from '../../generated/prisma/client.js';
import { buildBlockTree } from './build-block-tree.js';

const row = (
  id: string,
  type: BlockType,
  options: {
    assetId?: string;
    content?: Record<string, unknown>;
    position?: number | null;
    parentBlockId?: string | null;
    columnIndex?: number | null;
  } = {},
) => ({
  id,
  type,
  assetId: options.assetId ?? null,
  content: options.content ?? {},
  position: options.position === undefined ? 1 : options.position,
  parentBlockId: options.parentBlockId ?? null,
  columnIndex: options.columnIndex ?? null,
});

describe('buildBlockTree', () => {
  it('orders top-level rows by position', () => {
    const blocks = buildBlockTree([
      row('later', BlockType.RICH_TEXT, { position: 3 }),
      row('first', BlockType.RICH_TEXT, { position: 1 }),
      row('middle', BlockType.ACCORDION, { position: 2 }),
    ]);

    expect(blocks.map(({ id }) => id)).toEqual(['first', 'middle', 'later']);
  });

  it('fills both columns and represents missing children as null', () => {
    const both = row('both', BlockType.TWO_COLUMN, { position: 1 });
    const onlyFirst = row('only-first', BlockType.TWO_COLUMN, { position: 2 });
    const onlySecond = row('only-second', BlockType.TWO_COLUMN, { position: 3 });
    const empty = row('empty', BlockType.TWO_COLUMN, { position: 4 });

    expect(
      buildBlockTree([
        row('child-1', BlockType.IMAGE, {
          assetId: 'asset-1',
          parentBlockId: both.id,
          position: null,
          columnIndex: 1,
        }),
        both,
        row('child-0', BlockType.RICH_TEXT, {
          parentBlockId: both.id,
          position: null,
          columnIndex: 0,
        }),
        onlyFirst,
        row('first-child', BlockType.RICH_TEXT, {
          parentBlockId: onlyFirst.id,
          position: null,
          columnIndex: 0,
        }),
        onlySecond,
        row('second-child', BlockType.PDF, {
          assetId: 'asset-2',
          parentBlockId: onlySecond.id,
          position: null,
          columnIndex: 1,
        }),
        empty,
      ]),
    ).toEqual([
      {
        id: 'both',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [
          { id: 'child-0', type: BlockType.RICH_TEXT, content: {} },
          { id: 'child-1', type: BlockType.IMAGE, assetId: 'asset-1', content: {} },
        ],
      },
      {
        id: 'only-first',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [{ id: 'first-child', type: BlockType.RICH_TEXT, content: {} }, null],
      },
      {
        id: 'only-second',
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [
          null,
          { id: 'second-child', type: BlockType.PDF, assetId: 'asset-2', content: {} },
        ],
      },
      { id: 'empty', type: BlockType.TWO_COLUMN, content: {}, columns: [null, null] },
    ]);
  });

  it('omits columns on non-layout blocks and never exposes database-only fields', () => {
    const layout = row('layout', BlockType.TWO_COLUMN, { position: 1 });
    const child = row('child', BlockType.RICH_TEXT, {
      parentBlockId: layout.id,
      position: null,
      columnIndex: 0,
    });
    const [block] = buildBlockTree([child, layout]);

    expect(block).toEqual({
      id: 'layout',
      type: BlockType.TWO_COLUMN,
      content: {},
      columns: [{ id: 'child', type: BlockType.RICH_TEXT, content: {} }, null],
    });
    expect(Object.hasOwn(block!, 'position')).toBe(false);
    expect(Object.hasOwn(block!, 'parentBlockId')).toBe(false);
    expect(Object.hasOwn(block!, 'columnIndex')).toBe(false);
    expect(Object.hasOwn(block!, 'lessonId')).toBe(false);
    expect(Object.hasOwn(block!, 'createdAt')).toBe(false);

    const [nonLayout] = buildBlockTree([
      row('asset-block', BlockType.IMAGE, { assetId: 'asset', position: 2 }),
    ]);
    expect(nonLayout).toEqual({
      id: 'asset-block',
      type: BlockType.IMAGE,
      assetId: 'asset',
      content: {},
    });
    expect(Object.hasOwn(nonLayout!, 'columns')).toBe(false);
  });

  it('returns an empty tree for empty input', () => {
    expect(buildBlockTree([])).toEqual([]);
  });
});
