import { ContentStatus } from '../generated/prisma/client.js';

const ALLOWED_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  [ContentStatus.DRAFT]: [ContentStatus.ACTIVE, ContentStatus.ARCHIVED],
  [ContentStatus.ACTIVE]: [ContentStatus.ARCHIVED],
  [ContentStatus.ARCHIVED]: [ContentStatus.ACTIVE],
};

export function canTransitionContentStatus(current: ContentStatus, next: ContentStatus): boolean {
  return current === next || ALLOWED_TRANSITIONS[current].includes(next);
}
