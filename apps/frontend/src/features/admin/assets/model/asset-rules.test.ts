import { describe, expect, it } from 'vitest';
import {
  canPreview,
  deleteBlockedReason,
  nextStatus,
  previewUnavailableMessage,
  replaceBlockedReason,
} from './asset-rules';

describe('deleteBlockedReason', () => {
  it('blocks delete while lessons use the asset', () => {
    expect(deleteBlockedReason({ usedInTotal: 1 })).toBe(
      'Used in 1 lesson. Remove it from that lesson first.',
    );
    expect(deleteBlockedReason({ usedInTotal: 3 })).toContain('3 lessons');
  });
  it('blocks delete while a file is processing', () => {
    expect(deleteBlockedReason({ usedInTotal: 0, fileStatus: 'PROCESSING' })).not.toBeNull();
  });
  it('allows delete otherwise', () => {
    expect(deleteBlockedReason({ usedInTotal: 0, fileStatus: 'READY' })).toBeNull();
    expect(deleteBlockedReason({ usedInTotal: 0 })).toBeNull();
  });
});

describe('replace, preview and status rules', () => {
  it('blocks replace only while processing', () => {
    expect(replaceBlockedReason('UPLOADED')).not.toBeNull();
    expect(replaceBlockedReason('FAILED')).toBeNull();
    expect(replaceBlockedReason('READY', 'PPTX')).toContain('PPTX');
  });
  it('previews only READY files', () => {
    expect(canPreview('READY')).toBe(true);
    expect(canPreview('FAILED')).toBe(false);
    expect(previewUnavailableMessage('FAILED')).toContain('failed');
    expect(canPreview('READY', 'PPTX')).toBe(false);
    expect(previewUnavailableMessage('READY', 'PPTX')).toContain('not supported');
  });
  it('toggles the status', () => {
    expect(nextStatus('ACTIVE')).toBe('ARCHIVED');
    expect(nextStatus('ARCHIVED')).toBe('ACTIVE');
  });
});
