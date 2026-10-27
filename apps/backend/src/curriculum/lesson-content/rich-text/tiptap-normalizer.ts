import {
  MAX_LINK_LENGTH,
  MAX_ISSUES,
  MAX_RICH_TEXT_CHARS,
  MAX_RICH_TEXT_DEPTH,
  MAX_RICH_TEXT_NODES,
} from '../validation/limits.js';
import type { Issue } from '../validation/types.js';
import {
  ALLOWED_MARKS,
  BLOCK_NODES,
  DROPPED_LINK_ATTRIBUTES,
  INLINE_NODES,
  TEXT_ALIGNMENTS,
} from './tiptap-whitelist.js';

type RichNode = Record<string, unknown>;
type NodeTask = {
  source: unknown;
  parent: RichNode;
  key: 'content';
  index: number;
  indexPath: string;
  parentType: string;
  depth: number;
  textOnly: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(issues: Issue[], path: string, code: string, message: string): void {
  if (issues.length < MAX_ISSUES) issues.push({ path, code, message });
}

function addInvalid(issues: Issue[], path: string): void {
  issue(issues, path, 'INVALID_CONTENT', 'Rich-text content is invalid.');
}

function allowsChild(parent: string, child: string): boolean {
  if (parent === 'doc')
    return [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
      'horizontalRule',
    ].includes(child);
  if (parent === 'paragraph' || parent === 'heading') return INLINE_NODES.has(child);
  if (parent === 'bulletList' || parent === 'orderedList') return child === 'listItem';
  if (parent === 'listItem') return ['paragraph', 'bulletList', 'orderedList'].includes(child);
  if (parent === 'blockquote') return ['paragraph', 'bulletList', 'orderedList'].includes(child);
  return false;
}

function containsWhitespaceOrControl(value: string): boolean {
  for (const character of value) {
    if (/\s/u.test(character)) return true;
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) return true;
  }
  return false;
}

function normalizeLink(href: unknown, path: string, issues: Issue[]): string | undefined {
  if (
    typeof href !== 'string' ||
    href.length > MAX_LINK_LENGTH ||
    containsWhitespaceOrControl(href)
  ) {
    issue(issues, path, 'INVALID_LINK', 'Link must be an absolute http, https, or mailto URL.');
    return undefined;
  }
  try {
    const url = new URL(href);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      issue(issues, path, 'INVALID_LINK', 'Link must be an absolute http, https, or mailto URL.');
      return undefined;
    }
  } catch {
    issue(issues, path, 'INVALID_LINK', 'Link must be an absolute http, https, or mailto URL.');
    return undefined;
  }
  return href;
}

function normalizeMarks(
  source: unknown,
  path: string,
  issues: Issue[],
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(source)) {
    addInvalid(issues, path);
    return undefined;
  }
  const result: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  source.forEach((mark, index) => {
    const markPath = `${path}[${index}]`;
    if (!isObject(mark) || typeof mark.type !== 'string') {
      addInvalid(issues, markPath);
      return;
    }
    if (!ALLOWED_MARKS.has(mark.type)) {
      issue(
        issues,
        `${markPath}.type`,
        'UNSUPPORTED_MARK',
        'This rich-text mark is not supported.',
      );
      return;
    }
    const attrs = isObject(mark.attrs) ? mark.attrs : undefined;
    if (mark.attrs !== undefined && !attrs) {
      addInvalid(issues, `${markPath}.attrs`);
      return;
    }
    const allowedKeys = new Set(['type', ...(mark.attrs !== undefined ? ['attrs'] : [])]);
    Object.keys(mark).forEach((key) => {
      if (!allowedKeys.has(key))
        issue(issues, `${markPath}.${key}`, 'INVALID_CONTENT', 'Unexpected mark field.');
    });
    const normalized: Record<string, unknown> = { type: mark.type };
    if (mark.type === 'link') {
      if (!attrs || !Object.hasOwn(attrs, 'href')) {
        issue(issues, `${markPath}.attrs.href`, 'INVALID_LINK', 'Link href is required.');
      } else {
        const href = normalizeLink(attrs.href, `${markPath}.attrs.href`, issues);
        if (href !== undefined) normalized.attrs = { href };
      }
      if (attrs) {
        Object.keys(attrs).forEach((key) => {
          if (key === 'href' || DROPPED_LINK_ATTRIBUTES.has(key) || attrs[key] === null) return;
          issue(
            issues,
            `${markPath}.attrs.${key}`,
            'UNSUPPORTED_ATTRIBUTE',
            'This mark attribute is not supported.',
          );
        });
      }
    } else if (attrs) {
      Object.keys(attrs).forEach((key) => {
        if (attrs[key] !== null) {
          issue(
            issues,
            `${markPath}.attrs.${key}`,
            'UNSUPPORTED_ATTRIBUTE',
            'This mark attribute is not supported.',
          );
        }
      });
    }
    if (!seen.has(mark.type)) {
      seen.add(mark.type);
      result.push(normalized);
    }
  });
  return result.length ? result : undefined;
}

function normalizeAttributes(
  node: Record<string, unknown>,
  type: string,
  path: string,
  issues: Issue[],
): Record<string, unknown> | undefined {
  if (node.attrs === undefined) return undefined;
  if (!isObject(node.attrs)) {
    addInvalid(issues, `${path}.attrs`);
    return undefined;
  }
  const normalized: Record<string, unknown> = {};
  const allowed = new Set<string>();
  if (type === 'heading') allowed.add('level');
  if (type === 'orderedList') allowed.add('start');
  if (type === 'codeBlock') allowed.add('language');
  if (type === 'paragraph' || type === 'heading') allowed.add('textAlign');
  Object.entries(node.attrs).forEach(([key, value]) => {
    if (value === null) return;
    if (!allowed.has(key)) {
      issue(
        issues,
        `${path}.attrs.${key}`,
        'UNSUPPORTED_ATTRIBUTE',
        'This node attribute is not supported.',
      );
      return;
    }
    if (
      key === 'level' &&
      (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3)
    ) {
      addInvalid(issues, `${path}.attrs.level`);
      return;
    }
    if (key === 'start' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1)) {
      addInvalid(issues, `${path}.attrs.start`);
      return;
    }
    if (
      key === 'language' &&
      (typeof value !== 'string' || value.length > 30 || !/^[a-z0-9+#-]*$/u.test(value))
    ) {
      addInvalid(issues, `${path}.attrs.language`);
      return;
    }
    if (key === 'textAlign' && (typeof value !== 'string' || !TEXT_ALIGNMENTS.has(value))) {
      addInvalid(issues, `${path}.attrs.textAlign`);
      return;
    }
    normalized[key] = value;
  });
  return Object.keys(normalized).length ? normalized : undefined;
}

export function normalizeRichText(
  input: unknown,
  path: string,
  issues: Issue[],
): Record<string, unknown> {
  if (!isObject(input) || input.format !== 'tiptap' || !isObject(input.doc)) {
    addInvalid(issues, path);
    return {};
  }
  Object.keys(input).forEach((key) => {
    if (!['format', 'doc'].includes(key))
      issue(issues, `${path}.${key}`, 'UNKNOWN_FIELD', 'Unknown rich-text field.');
  });

  const doc = input.doc;
  const root: RichNode = { type: 'doc' };
  let nodeCount = 1;
  let textCharacters = 0;
  const queue: NodeTask[] = [];
  if (doc.content !== undefined) {
    if (!Array.isArray(doc.content)) addInvalid(issues, `${path}.doc.content`);
    else {
      root.content = [];
      const maxChildren = MAX_RICH_TEXT_NODES - nodeCount;
      if (doc.content.length > maxChildren) {
        issue(
          issues,
          `${path}.doc.content[${maxChildren}]`,
          'TOO_MANY_NODES',
          'Rich text contains too many nodes.',
        );
      }
      for (let index = Math.min(doc.content.length, maxChildren) - 1; index >= 0; index--) {
        queue.push({
          source: doc.content[index],
          parent: root,
          key: 'content',
          index,
          indexPath: `[${index}]`,
          parentType: 'doc',
          depth: 2,
          textOnly: false,
        });
      }
    }
  }
  Object.keys(doc).forEach((key) => {
    if (!['type', 'content'].includes(key))
      issue(issues, `${path}.doc.${key}`, 'INVALID_CONTENT', 'Unexpected document field.');
  });
  if (doc.type !== 'doc') addInvalid(issues, `${path}.doc.type`);

  while (queue.length > 0 && issues.length < MAX_ISSUES) {
    const task = queue.pop();
    if (!task) break;
    const nodePath = `${path}.doc.content${task.indexPath}`;
    // Depth is checked before any child is scheduled, keeping traversal stack-safe.
    if (task.depth > MAX_RICH_TEXT_DEPTH) {
      issue(issues, nodePath, 'DEPTH_EXCEEDED', 'Rich-text nesting is too deep.');
      continue;
    }
    nodeCount++;
    if (nodeCount > MAX_RICH_TEXT_NODES) {
      issue(issues, nodePath, 'TOO_MANY_NODES', 'Rich text contains too many nodes.');
      break;
    }
    if (!isObject(task.source) || typeof task.source.type !== 'string') {
      addInvalid(issues, nodePath);
      continue;
    }
    const type = task.source.type;
    if (!BLOCK_NODES.has(type) && !INLINE_NODES.has(type)) {
      issue(
        issues,
        `${nodePath}.type`,
        'UNSUPPORTED_NODE',
        'This rich-text node is not supported.',
      );
      continue;
    }
    if (!allowsChild(task.parentType, type) && !(task.textOnly && type === 'text')) {
      addInvalid(issues, nodePath);
      continue;
    }
    const output: RichNode = { type };
    const attrs = normalizeAttributes(task.source, type, nodePath, issues);
    if (attrs) output.attrs = attrs;
    if (type === 'heading' && attrs?.level === undefined) {
      addInvalid(issues, `${nodePath}.attrs.level`);
    }
    const allowedFields = new Set(['type']);
    if (task.source.attrs !== undefined) allowedFields.add('attrs');
    if (type === 'text') {
      allowedFields.add('text');
      if (typeof task.source.text !== 'string' || task.source.text.length === 0) {
        addInvalid(issues, `${nodePath}.text`);
        continue;
      }
      textCharacters += task.source.text.length;
      if (textCharacters > MAX_RICH_TEXT_CHARS) {
        issue(issues, `${nodePath}.text`, 'TOO_LONG', 'Rich text contains too many characters.');
        break;
      }
      output.text = task.source.text;
      if (task.source.marks !== undefined) {
        allowedFields.add('marks');
        if (task.textOnly) {
          if (!Array.isArray(task.source.marks) || task.source.marks.length > 0) {
            addInvalid(issues, `${nodePath}.marks`);
          }
        } else {
          const marks = normalizeMarks(task.source.marks, `${nodePath}.marks`, issues);
          if (marks) output.marks = marks;
        }
      }
    } else if (type === 'hardBreak' || type === 'horizontalRule') {
      // These nodes do not carry content or marks.
    } else {
      if (task.source.content !== undefined) {
        allowedFields.add('content');
        if (!Array.isArray(task.source.content)) {
          addInvalid(issues, `${nodePath}.content`);
        } else {
          if (
            task.source.content.length === 0 &&
            ['bulletList', 'orderedList', 'listItem', 'blockquote'].includes(type)
          ) {
            addInvalid(issues, `${nodePath}.content`);
          }
          output.content = [];
          const maxChildren = MAX_RICH_TEXT_NODES - nodeCount - queue.length;
          if (task.source.content.length > maxChildren) {
            issue(
              issues,
              `${nodePath}.content[${maxChildren}]`,
              'TOO_MANY_NODES',
              'Rich text contains too many nodes.',
            );
            break;
          }
          for (let index = task.source.content.length - 1; index >= 0; index--) {
            queue.push({
              source: task.source.content[index],
              parent: output,
              key: 'content',
              index,
              indexPath: `${task.indexPath}.content[${index}]`,
              parentType: type,
              depth: task.depth + 1,
              textOnly: type === 'codeBlock',
            });
          }
        }
      } else if (['bulletList', 'orderedList', 'listItem', 'blockquote'].includes(type)) {
        addInvalid(issues, `${nodePath}.content`);
      }
    }
    Object.keys(task.source).forEach((key) => {
      if (!allowedFields.has(key))
        issue(issues, `${nodePath}.${key}`, 'INVALID_CONTENT', 'Unexpected rich-text node field.');
    });
    (task.parent[task.key] as RichNode[])[task.index] = output;
  }
  return { format: 'tiptap', doc: root };
}
