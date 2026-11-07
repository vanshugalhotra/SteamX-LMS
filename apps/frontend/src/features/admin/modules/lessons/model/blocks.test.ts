import { expect, it } from 'vitest';
import { moveBlock } from './blocks';
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
