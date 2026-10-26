import { describe, expect, it } from 'vitest';
import {
  MAX_LINK_LENGTH,
  MAX_RICH_TEXT_CHARS,
  MAX_RICH_TEXT_DEPTH,
  MAX_RICH_TEXT_NODES,
} from '../limits.js';
import { validateLessonContent } from '../validate-lesson-content.js';
import { BlockType } from '../../../generated/prisma/enums.js';

const id = '00000000-0000-4000-8000-000000000001';
const lesson = (doc: unknown) =>
  validateLessonContent({
    blocks: [{ id, type: BlockType.RICH_TEXT, content: { format: 'tiptap', doc } }],
  });
const document = (node: unknown) => ({ type: 'doc', content: [node] });
const issueFor = (input: unknown) => {
  const result = lesson(input);
  return result.ok ? undefined : result.issues[0];
};

describe('TipTap rich-text normalizer', () => {
  it.each([
    ['paragraph', { type: 'paragraph' }],
    ['heading', { type: 'heading', attrs: { level: 2, textAlign: 'center' } }],
    [
      'bulletList',
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    ],
    [
      'orderedList',
      {
        type: 'orderedList',
        attrs: { start: 2 },
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
    ],
    ['blockquote', { type: 'blockquote', content: [{ type: 'paragraph' }] }],
    [
      'codeBlock',
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'code' }] },
    ],
    ['horizontalRule', { type: 'horizontalRule' }],
    ['text', { type: 'paragraph', content: [{ type: 'text', text: 'text' }] }],
    ['hardBreak', { type: 'paragraph', content: [{ type: 'hardBreak' }] }],
  ])('accepts allowed node %s', (_name, node) => {
    expect(lesson(document(node)).ok).toBe(true);
  });

  it.each(['bold', 'italic', 'underline', 'strike', 'code', 'link'])('accepts %s mark', (mark) => {
    const attrs = mark === 'link' ? { href: 'https://example.com' } : undefined;
    const richNode = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: mark, ...(attrs ? { attrs } : {}) }] }],
    };
    expect(lesson(document(richNode)).ok).toBe(true);
  });

  it.each([
    [{ type: 'image' }, 'UNSUPPORTED_NODE'],
    [
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] },
      'UNSUPPORTED_MARK',
    ],
    [{ type: 'paragraph', attrs: { class: 'x' } }, 'UNSUPPORTED_ATTRIBUTE'],
    [{ type: 'heading', attrs: { level: 4 } }, 'INVALID_CONTENT'],
    [{ type: 'heading' }, 'INVALID_CONTENT'],
    [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [{ type: 'link', attrs: { href: 'https://example.com', unknown: true } }],
          },
        ],
      },
      'UNSUPPORTED_ATTRIBUTE',
    ],
    [
      {
        type: 'paragraph',
        content: [
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        ],
      },
      'INVALID_CONTENT',
    ],
    [{ type: 'bulletList', content: [{ type: 'paragraph' }] }, 'INVALID_CONTENT'],
    [
      { type: 'codeBlock', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] },
      'INVALID_CONTENT',
    ],
  ])('rejects rich-text structures with %s', (node, code) => {
    expect(issueFor(document(node))?.code).toBe(code);
  });

  it.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['mailto:user@example.com', true],
    ['/relative/path', false],
    ['javascript:alert(1)', false],
    ['data:text/plain,x', false],
    ['ftp://example.com', false],
    ['https://example.com/a b', false],
    [`https://example.com/${'x'.repeat(MAX_LINK_LENGTH)}`, false],
  ])('validates link %s', (href, valid) => {
    const input = document({
      type: 'paragraph',
      content: [{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href } }] }],
    });
    expect(lesson(input).ok).toBe(valid);
  });

  it('accepts a link exactly at MAX_LINK_LENGTH', () => {
    const prefix = 'https://a/';
    const href = `${prefix}${'x'.repeat(MAX_LINK_LENGTH - prefix.length)}`;
    const result = lesson(
      document({
        type: 'paragraph',
        content: [{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href } }] }],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts and drops null-valued attributes', () => {
    const result = lesson(
      document({
        type: 'heading',
        attrs: { level: 2, textAlign: null },
        content: [
          { type: 'text', text: 'heading', marks: [{ type: 'bold', attrs: { ignored: null } }] },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = result.blocks[0]?.content as {
        doc: {
          content: Array<{
            attrs?: Record<string, unknown>;
            content: Array<Record<string, unknown>>;
          }>;
        };
      };
      expect(content.doc.content[0]?.attrs).toEqual({ level: 2 });
      expect(content.doc.content[0]?.content[0]).toEqual({
        type: 'text',
        text: 'heading',
        marks: [{ type: 'bold' }],
      });
    }
  });

  it('drops default link attributes and empty marks, and de-duplicates marks', () => {
    const input = document({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '<script>alert(1)</script>',
          marks: [
            { type: 'bold' },
            { type: 'bold' },
            {
              type: 'link',
              attrs: {
                href: 'https://example.com',
                target: '_blank',
                rel: 'noopener',
                class: 'external',
              },
            },
          ],
        },
      ],
    });
    const result = lesson(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = result.blocks[0]?.content as {
        doc: { content: Array<{ content?: Array<{ text?: string; marks?: unknown[] }> }> };
      };
      const text = content.doc.content[0]?.content?.[0];
      expect(text?.text).toBe('<script>alert(1)</script>');
      expect(text?.marks).toEqual([
        { type: 'bold' },
        { type: 'link', attrs: { href: 'https://example.com' } },
      ]);
    }
    const emptyMarks = lesson(
      document({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [] }] }),
    );
    expect(emptyMarks.ok).toBe(true);
    if (emptyMarks.ok) {
      const rich = emptyMarks.blocks[0]?.content as {
        doc: { content: Array<{ content: Array<Record<string, unknown>> }> };
      };
      expect(rich.doc.content[0]?.content[0]).toEqual({ type: 'text', text: 'x' });
    }
  });

  it.each([
    ['text', MAX_RICH_TEXT_CHARS, true, undefined],
    ['text', MAX_RICH_TEXT_CHARS + 1, false, 'TOO_LONG'],
    ['nodes', MAX_RICH_TEXT_NODES, true, undefined],
    ['nodes', MAX_RICH_TEXT_NODES + 1, false, 'TOO_MANY_NODES'],
  ])('enforces %s limit at %s', (kind, count, valid, code) => {
    const nodes =
      kind === 'text'
        ? [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(count) }] }]
        : Array.from({ length: count - 1 }, () => ({ type: 'paragraph' }));
    const result = lesson({ type: 'doc', content: nodes });
    expect(result.ok).toBe(valid);
    if (!valid && !result.ok) expect(result.issues[0]?.code).toBe(code);
  });

  it('accepts exact depth limit and rejects a 100,000-level input without recursion', () => {
    const deepChild = (levels: number): Record<string, unknown> => {
      let node: Record<string, unknown> = { type: 'paragraph' };
      for (let index = 0; index < levels; index++) {
        node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
      }
      return node;
    };
    const within = lesson(document(deepChild((MAX_RICH_TEXT_DEPTH - 2) / 2)));
    expect(within.ok).toBe(true);

    let nested: Record<string, unknown> = { type: 'paragraph' };
    for (let index = 0; index < 100_000; index++) {
      nested = { type: 'bulletList', content: [{ type: 'listItem', content: [nested] }] };
    }
    const rejected = lesson(document(nested));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issues[0]?.code).toBe('DEPTH_EXCEEDED');
  });

  it('preserves the input and returns equal normalized content on a second pass', () => {
    const input = document({ type: 'paragraph', content: [{ type: 'text', text: 'unchanged' }] });
    const result = lesson(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(validateLessonContent({ blocks: result.blocks })).toEqual(result);
  });
});
