import { BlockType } from '../../../generated/prisma/enums.js';
import { describe, expect, it } from 'vitest';
import { MAX_BLOCKS, MAX_ISSUES } from './limits.js';
import {
  collectAssetIds,
  collectBlockIds,
  validateLessonContent,
} from './validate-lesson-content.js';
import type { NormalizedBlock } from './types.js';

const id = (number: number): string =>
  `00000000-0000-4000-8000-${number.toString().padStart(12, '0')}`;
const richDoc = { format: 'tiptap', doc: { type: 'doc', content: [{ type: 'paragraph' }] } };
const block = (type: string, index: number, fields: Record<string, unknown> = {}) => ({
  id: id(index),
  type,
  content: {},
  ...fields,
});

describe('validateLessonContent', () => {
  it.each([
    [BlockType.RICH_TEXT, richDoc, undefined],
    [BlockType.ACCORDION, { title: 'Title', body: richDoc }, undefined],
    [BlockType.IMAGE, {}, id(900)],
    [BlockType.VIDEO, {}, id(901)],
    [BlockType.PDF, {}, id(902)],
    [BlockType.TWO_COLUMN, {}, undefined, [null, null]],
  ] as Array<[string, Record<string, unknown>, string | undefined, unknown[] | undefined]>)(
    'accepts minimal %s blocks',
    (type, content, assetId, columns) => {
      const result = validateLessonContent({
        blocks: [
          block(type, 1, {
            content,
            ...(assetId ? { assetId } : {}),
            ...(columns ? { columns } : {}),
          }),
        ],
      });
      expect(result.ok).toBe(true);
    },
  );

  it.each([
    [BlockType.RICH_TEXT, richDoc, undefined],
    [BlockType.ACCORDION, { title: '  A title  ', body: richDoc }, undefined],
    [BlockType.IMAGE, { alt: '  Accessible  ', caption: ' Caption ' }, id(903)],
    [BlockType.VIDEO, { caption: ' Video ' }, id(904)],
    [BlockType.PDF, { caption: ' Document ' }, id(905)],
    [
      BlockType.TWO_COLUMN,
      {},
      undefined,
      [
        block(BlockType.IMAGE, 2, { assetId: id(906) }),
        block(BlockType.RICH_TEXT, 3, { content: richDoc }),
      ],
    ],
  ] as Array<[string, Record<string, unknown>, string | undefined, unknown[] | undefined]>)(
    'normalizes full %s blocks',
    (type, content, assetId, columns) => {
      const result = validateLessonContent({
        blocks: [
          block(type, 1, {
            content,
            ...(assetId ? { assetId } : {}),
            ...(columns ? { columns } : {}),
          }),
        ],
      });
      expect(result.ok).toBe(true);
      if (result.ok && type === BlockType.ACCORDION)
        expect(result.blocks[0]?.content.title).toBe('A title');
      if (result.ok && type === BlockType.IMAGE) {
        expect(result.blocks[0]?.content).toEqual({ alt: 'Accessible', caption: 'Caption' });
      }
    },
  );

  it.each([
    [block(BlockType.IMAGE, 1), 'ASSET_REQUIRED', 'blocks[0].assetId'],
    [
      block(BlockType.RICH_TEXT, 1, { content: richDoc, assetId: id(10) }),
      'ASSET_NOT_ALLOWED',
      'blocks[0].assetId',
    ],
    [block(BlockType.PPTX, 1), 'BLOCK_TYPE_NOT_SUPPORTED', 'blocks[0].type'],
    [block('UNKNOWN', 1), 'BLOCK_TYPE_NOT_SUPPORTED', 'blocks[0].type'],
    [block(BlockType.RICH_TEXT, 1, { content: {} }), 'INVALID_CONTENT', 'blocks[0].content'],
    [
      block(BlockType.ACCORDION, 1, { content: { body: richDoc } }),
      'INVALID_CONTENT',
      'blocks[0].content.title',
    ],
    [
      block(BlockType.IMAGE, 1, { assetId: id(11), content: { caption: 7 } }),
      'INVALID_CONTENT',
      'blocks[0].content.caption',
    ],
    [
      block(BlockType.VIDEO, 1, { assetId: id(12), content: { source: 'x' } }),
      'UNKNOWN_FIELD',
      'blocks[0].content.source',
    ],
    [
      block(BlockType.PDF, 1, { assetId: id(13), content: { caption: 'x'.repeat(301) } }),
      'TOO_LONG',
      'blocks[0].content.caption',
    ],
    [
      block(BlockType.RICH_TEXT, 1, { content: richDoc, unexpected: true }),
      'UNKNOWN_FIELD',
      'blocks[0].unexpected',
    ],
    [
      block(BlockType.IMAGE, 1, { assetId: id(11), content: { extra: true } }),
      'UNKNOWN_FIELD',
      'blocks[0].content.extra',
    ],
    [
      block(BlockType.ACCORDION, 1, { content: { title: '  ', body: richDoc } }),
      'INVALID_CONTENT',
      'blocks[0].content.title',
    ],
    [
      block(BlockType.ACCORDION, 1, { content: { title: 'x'.repeat(201), body: richDoc } }),
      'TOO_LONG',
      'blocks[0].content.title',
    ],
    [
      block(BlockType.TWO_COLUMN, 1, { content: { extra: true }, columns: [null, null] }),
      'UNKNOWN_FIELD',
      'blocks[0].content.extra',
    ],
    [block(BlockType.TWO_COLUMN, 1), 'INVALID_CONTENT', 'blocks[0].columns'],
    [
      block(BlockType.TWO_COLUMN, 1, { content: {}, assetId: id(13), columns: [null, null] }),
      'ASSET_NOT_ALLOWED',
      'blocks[0].assetId',
    ],
    [
      block(BlockType.TWO_COLUMN, 1, { content: {}, columns: [null] }),
      'INVALID_CONTENT',
      'blocks[0].columns',
    ],
    [
      block(BlockType.RICH_TEXT, 1, { content: richDoc, columns: [null, null] }),
      'INVALID_CONTENT',
      'blocks[0].columns',
    ],
    [
      { ...block(BlockType.IMAGE, 1, { assetId: id(14) }), id: 'not-a-uuid' },
      'INVALID_ID',
      'blocks[0].id',
    ],
  ])('rejects invalid block %j with its code and path', (item, code, path) => {
    const result = validateLessonContent({ blocks: [item] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code, path }));
  });

  it.each([
    [BlockType.RICH_TEXT, { content: richDoc }],
    [BlockType.ACCORDION, { content: { title: 'Details', body: richDoc } }],
    [BlockType.IMAGE, { assetId: id(15) }],
    [BlockType.VIDEO, { assetId: id(16) }],
    [BlockType.PDF, { assetId: id(17) }],
  ])('allows %s in a column', (type, fields) => {
    const result = validateLessonContent({
      blocks: [block(BlockType.TWO_COLUMN, 1, { columns: [block(type, 2, fields), null] })],
    });
    expect(result.ok).toBe(true);
  });

  it('removes empty optional image text after trimming', () => {
    const result = validateLessonContent({
      blocks: [block(BlockType.IMAGE, 1, { assetId: id(12), content: { alt: '  ', caption: '' } })],
    });
    expect(result).toEqual({
      ok: true,
      blocks: [{ id: id(1), type: BlockType.IMAGE, assetId: id(12), content: {} }],
    });
  });

  it('accepts title and caption strings at their configured limits', () => {
    const result = validateLessonContent({
      blocks: [
        block(BlockType.ACCORDION, 1, {
          content: { title: 't'.repeat(200), body: richDoc },
        }),
        block(BlockType.IMAGE, 2, {
          assetId: id(18),
          content: { alt: 'a'.repeat(300), caption: 'c'.repeat(300) },
        }),
        block(BlockType.VIDEO, 3, { assetId: id(19), content: { caption: 'v'.repeat(300) } }),
        block(BlockType.PDF, 4, { assetId: id(20), content: { caption: 'p'.repeat(300) } }),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a nested layout and duplicate ids differing by case', () => {
    const duplicate = id(2).toUpperCase();
    const result = validateLessonContent({
      blocks: [
        block(BlockType.TWO_COLUMN, 1, {
          columns: [block(BlockType.TWO_COLUMN, 2, { columns: [null, null] }), null],
        }),
        { ...block(BlockType.RICH_TEXT, 3, { content: richDoc }), id: duplicate },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'INVALID_CONTENT', path: 'blocks[0].columns[0].type' }),
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'DUPLICATE_ID', path: 'blocks[1].id' }),
      );
    }
  });

  it('counts nested blocks toward the lesson block limit', () => {
    const blocks = Array.from({ length: MAX_BLOCKS - 2 }, (_, index) =>
      block(BlockType.RICH_TEXT, index + 1, { content: richDoc }),
    );
    blocks.push(
      block(BlockType.TWO_COLUMN, 200, {
        columns: [block(BlockType.IMAGE, 201, { assetId: id(20) }), null],
      }),
    );
    const accepted = validateLessonContent({ blocks });
    expect(accepted.ok).toBe(true);
    const rejected = validateLessonContent({
      blocks: [...blocks, block(BlockType.RICH_TEXT, 202, { content: richDoc })],
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok)
      expect(rejected.issues).toContainEqual(
        expect.objectContaining({ code: 'TOO_MANY_BLOCKS', path: 'blocks[99]' }),
      );
  });

  it('stops collecting issues at MAX_ISSUES', () => {
    const result = validateLessonContent({
      blocks: Array.from({ length: MAX_ISSUES + 5 }, (_, index) => block('unsupported', index + 1)),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toHaveLength(MAX_ISSUES);
  });

  it('lowercases ids, is idempotent, and does not mutate deeply frozen input', () => {
    const input = {
      blocks: [
        block(BlockType.TWO_COLUMN, 1, {
          columns: [
            block(BlockType.IMAGE, 2, { assetId: id(21).toUpperCase(), content: { alt: ' A ' } }),
            null,
          ],
        }),
      ],
    };
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(input);
    const first = validateLessonContent(input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.blocks[0]?.id).toBe(id(1));
    expect(first.blocks[0]?.columns?.[0]?.assetId).toBe(id(21));
    const second = validateLessonContent({ blocks: first.blocks });
    expect(second).toEqual(first);
  });

  it('collects unique asset ids and block ids in tree order', () => {
    const normalized = [
      {
        id: id(1),
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [
          { id: id(2), type: BlockType.IMAGE, assetId: id(30), content: {} },
          { id: id(3), type: BlockType.VIDEO, assetId: id(30), content: {} },
        ],
      },
    ] as NormalizedBlock[];
    expect(collectAssetIds(normalized)).toEqual([id(30)]);
    expect(collectBlockIds(normalized)).toEqual([id(1), id(2), id(3)]);
  });

  it.each([undefined, null, 0, 'x', [], {}, [null, 0, 'bad'], 'x'.repeat(100_000)])(
    'returns an issue instead of throwing for junk input',
    (input) => {
      expect(() => validateLessonContent(input)).not.toThrow();
      expect(validateLessonContent(input).ok).toBe(false);
    },
  );
});
