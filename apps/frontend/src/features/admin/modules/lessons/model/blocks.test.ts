import { expect, it } from 'vitest';
import { findIncompleteBlockIds, moveBlock, reorderBlock, setBlockField } from './blocks';
import type { LessonContentBlock } from './types';

const b = (id: string) => ({ id, type: 'RICH_TEXT', content: {} }) as LessonContentBlock;
const ids = (list: LessonContentBlock[]) => list.map((x) => x.id);

it('moves a block by one position', () => {
  expect(ids(moveBlock([b('a'), b('b'), b('c')], 1, -1))).toEqual(['b', 'a', 'c']);
});

it('returns the same list at the edges', () => {
  const list = [b('a'), b('b')];
  expect(moveBlock(list, 0, -1)).toBe(list);
  expect(moveBlock(list, 1, 1)).toBe(list);
});

it('reorders blocks to an arbitrary position and ignores invalid positions', () => {
  const list = [b('a'), b('b'), b('c')];
  expect(ids(reorderBlock(list, 0, 2))).toEqual(['b', 'c', 'a']);
  expect(ids(reorderBlock(list, 2, 0))).toEqual(['c', 'a', 'b']);
  expect(reorderBlock(list, 1, 1)).toBe(list);
  expect(reorderBlock(list, -1, 1)).toBe(list);
});

it('finds asset blocks that have no asset yet', () => {
  const blocks = [
    b('a'),
    { ...b('b'), type: 'IMAGE' },
    { ...b('c'), type: 'PDF', assetId: 'asset-1' },
  ] as LessonContentBlock[];
  expect(findIncompleteBlockIds(blocks)).toEqual(['b']);
});

it('drops empty text fields', () => {
  const block = { ...b('a'), type: 'IMAGE', content: { alt: 'x' } } as LessonContentBlock;
  expect(setBlockField(block, 'alt', '').content).toEqual({});
  expect(setBlockField(block, 'caption', 'Hi').content).toEqual({ alt: 'x', caption: 'Hi' });
});
