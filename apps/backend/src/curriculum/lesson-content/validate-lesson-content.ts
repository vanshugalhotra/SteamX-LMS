import { BlockType } from '../../generated/prisma/enums.js';
import { z } from 'zod';
import { MAX_BLOCKS, MAX_ISSUES } from './limits.js';
import { blockDefinitions } from './block-definitions/registry.js';
import { addIssue, isObject } from './block-definitions/validation-helpers.js';
import type { Issue, NormalizedBlock } from './types.js';

/**
 * Validates and rebuilds lesson blocks without mutating the input.
 * Block-specific rules live in the definitions registry; tree and ID rules live here.
 */
const UUID_SCHEMA = z.uuid();
const BLOCK_FIELDS = ['id', 'type', 'assetId', 'content', 'columns'];

type ValidationResult = { ok: true; blocks: NormalizedBlock[] } | { ok: false; issues: Issue[] };

/** Narrows enum values without accepting unsupported database block types. */
function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && Object.values(BlockType).some((type) => type === value);
}

/** Validates and normalizes a block, recursively visiting its optional column children. */
function normalizeBlock(
  input: unknown,
  path: string,
  issues: Issue[],
  context: { count: number; ids: Set<string> },
  inColumn: boolean,
): NormalizedBlock | undefined {
  if (issues.length >= MAX_ISSUES) return undefined;
  context.count++;
  if (context.count > MAX_BLOCKS) {
    addIssue(issues, path, 'TOO_MANY_BLOCKS', 'Lesson contains too many blocks.');
    return undefined;
  }
  if (!isObject(input)) {
    addIssue(issues, path, 'INVALID_CONTENT', 'Block must be an object.');
    return undefined;
  }
  Object.keys(input).forEach((key) => {
    if (!BLOCK_FIELDS.includes(key)) {
      addIssue(issues, `${path}.${key}`, 'UNKNOWN_FIELD', 'Unknown block field.');
    }
  });

  let id = '';
  if (typeof input.id !== 'string' || !UUID_SCHEMA.safeParse(input.id).success) {
    addIssue(issues, `${path}.id`, 'INVALID_ID', 'Block id must be a UUID.');
  } else {
    // IDs are compared in lowercase so casing cannot bypass uniqueness checks.
    id = input.id.toLowerCase();
    if (context.ids.has(id))
      addIssue(issues, `${path}.id`, 'DUPLICATE_ID', 'Block ids must be unique.');
    context.ids.add(id);
  }

  if (!isBlockType(input.type)) {
    addIssue(
      issues,
      `${path}.type`,
      'BLOCK_TYPE_NOT_SUPPORTED',
      'This block type is not supported.',
    );
    return undefined;
  }
  const type = input.type;
  const definition = blockDefinitions[type];
  if (!definition) {
    addIssue(
      issues,
      `${path}.type`,
      'BLOCK_TYPE_NOT_SUPPORTED',
      'This block type is not supported.',
    );
    return undefined;
  }
  if (inColumn && !definition.allowedInColumn) {
    addIssue(
      issues,
      `${path}.type`,
      'INVALID_CONTENT',
      'Layout blocks cannot be nested in columns.',
    );
  }

  let assetId: string | undefined;
  if (definition.assetType) {
    if (input.assetId === undefined) {
      addIssue(issues, `${path}.assetId`, 'ASSET_REQUIRED', 'This block requires an asset id.');
    } else if (typeof input.assetId !== 'string' || !UUID_SCHEMA.safeParse(input.assetId).success) {
      addIssue(issues, `${path}.assetId`, 'INVALID_ID', 'Asset id must be a UUID.');
    } else {
      assetId = input.assetId.toLowerCase();
    }
  } else if (input.assetId !== undefined) {
    addIssue(
      issues,
      `${path}.assetId`,
      'ASSET_NOT_ALLOWED',
      'This block cannot reference an asset.',
    );
  }

  const content = definition.validateContent(input.content, `${path}.content`, issues);
  let columns: [NormalizedBlock | null, NormalizedBlock | null] | undefined;
  if (type === BlockType.TWO_COLUMN) {
    if (!Object.hasOwn(input, 'columns')) {
      addIssue(
        issues,
        `${path}.columns`,
        'INVALID_CONTENT',
        'Two-column blocks require exactly two columns.',
      );
    } else if (!Array.isArray(input.columns) || input.columns.length !== 2) {
      addIssue(
        issues,
        `${path}.columns`,
        'INVALID_CONTENT',
        'Two-column blocks require exactly two columns.',
      );
    } else {
      columns = [null, null];
      for (let index = 0; index < 2 && issues.length < MAX_ISSUES; index++) {
        const child = input.columns[index];
        if (child === null) continue;
        const normalized = normalizeBlock(
          child,
          `${path}.columns[${index}]`,
          issues,
          context,
          true,
        );
        if (normalized) columns[index] = normalized;
      }
    }
  } else if (Object.hasOwn(input, 'columns')) {
    addIssue(
      issues,
      `${path}.columns`,
      'INVALID_CONTENT',
      'Columns are only allowed on two-column blocks.',
    );
  }

  return {
    id,
    type,
    ...(assetId ? { assetId } : {}),
    content,
    ...(columns ? { columns } : {}),
  };
}

/** Validates the lesson envelope and returns either a complete normalized tree or issues. */
function validate(input: unknown): ValidationResult {
  const issues: Issue[] = [];
  if (!isObject(input) || !Array.isArray(input.blocks)) {
    return {
      ok: false,
      issues: [
        {
          path: 'blocks',
          code: 'INVALID_CONTENT',
          message: 'Lesson content must contain a blocks array.',
        },
      ],
    };
  }
  const blocks: NormalizedBlock[] = [];
  const context = { count: 0, ids: new Set<string>() };
  // A shared context counts IDs and blocks across the full tree.
  for (let index = 0; index < input.blocks.length && issues.length < MAX_ISSUES; index++) {
    const block = normalizeBlock(input.blocks[index], `blocks[${index}]`, issues, context, false);
    if (block) blocks.push(block);
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, blocks };
}

/** Public boundary: malformed input always produces issues instead of escaping as an exception. */
export function validateLessonContent(input: unknown): ValidationResult {
  try {
    return validate(input);
  } catch {
    // Keep this validator total even if an unexpected runtime value throws during inspection.
    return {
      ok: false,
      issues: [{ path: 'blocks', code: 'INVALID_CONTENT', message: 'Lesson content is invalid.' }],
    };
  }
}

/** Returns unique asset IDs from top-level blocks and column children. */
export function collectAssetIds(blocks: NormalizedBlock[]): string[] {
  const ids = new Set<string>();
  const pending = [...blocks];
  for (let index = 0; index < pending.length; index++) {
    const block = pending[index];
    if (!block) continue;
    if (block.assetId) ids.add(block.assetId);
    if (block.columns) {
      for (const child of block.columns) if (child) pending.push(child);
    }
  }
  return [...ids];
}

/** Returns block IDs in visual order, including blocks nested in columns. */
export function collectBlockIds(blocks: NormalizedBlock[]): string[] {
  const ids: string[] = [];
  const pending = [...blocks].reverse();
  while (pending.length) {
    const block = pending.pop();
    if (!block) continue;
    ids.push(block.id);
    if (block.columns) {
      for (let index = block.columns.length - 1; index >= 0; index--) {
        const child = block.columns[index];
        if (child) pending.push(child);
      }
    }
  }
  return ids;
}
