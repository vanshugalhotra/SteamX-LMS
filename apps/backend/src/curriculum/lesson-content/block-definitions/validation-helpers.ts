import { MAX_ALT_OR_CAPTION, MAX_ISSUES, MAX_TITLE } from '../limits.js';
import type { Issue } from '../types.js';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function recordContent(
  content: unknown,
  path: string,
  issues: Issue[],
): Record<string, unknown> {
  if (isObject(content)) return content;
  addIssue(issues, path, 'INVALID_CONTENT', 'Block content must be an object.');
  return {};
}

export function addIssue(issues: Issue[], path: string, code: string, message: string): void {
  if (issues.length < MAX_ISSUES) issues.push({ path, code, message });
}

export function rejectUnknownFields(
  content: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: Issue[],
): void {
  Object.keys(content).forEach((key) => {
    if (!allowed.includes(key)) {
      addIssue(issues, `${path}.${key}`, 'UNKNOWN_FIELD', 'Unknown content field.');
    }
  });
}

export function optionalText(
  value: unknown,
  path: string,
  max: typeof MAX_TITLE | typeof MAX_ALT_OR_CAPTION,
  issues: Issue[],
): string | undefined {
  if (typeof value !== 'string') {
    addIssue(issues, path, 'INVALID_CONTENT', 'Value must be a string.');
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    addIssue(issues, path, 'TOO_LONG', `Value must be at most ${max} characters.`);
    return undefined;
  }
  return trimmed || undefined;
}
