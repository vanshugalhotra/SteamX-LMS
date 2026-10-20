import { describe, expect, it } from 'vitest';
import { ContentStatus } from '../generated/prisma/client.js';
import { canTransitionContentStatus } from './content-status.js';

describe('canTransitionContentStatus', () => {
  it.each([
    [ContentStatus.DRAFT, ContentStatus.DRAFT],
    [ContentStatus.DRAFT, ContentStatus.ACTIVE],
    [ContentStatus.DRAFT, ContentStatus.ARCHIVED],
    [ContentStatus.ACTIVE, ContentStatus.ACTIVE],
    [ContentStatus.ACTIVE, ContentStatus.ARCHIVED],
    [ContentStatus.ARCHIVED, ContentStatus.ARCHIVED],
    [ContentStatus.ARCHIVED, ContentStatus.ACTIVE],
  ])('allows %s -> %s', (current, next) => {
    expect(canTransitionContentStatus(current, next)).toBe(true);
  });

  it.each([
    [ContentStatus.ACTIVE, ContentStatus.DRAFT],
    [ContentStatus.ARCHIVED, ContentStatus.DRAFT],
  ])('rejects %s -> %s', (current, next) => {
    expect(canTransitionContentStatus(current, next)).toBe(false);
  });
});
