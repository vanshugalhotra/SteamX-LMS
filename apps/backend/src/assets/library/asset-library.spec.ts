import { describe, expect, it } from 'vitest';
import { AssetFileStatus } from '../../generated/prisma/client.js';
import type { AssetFileSelection } from './asset-file-selection.js';
import { pickCurrentFile } from './asset-library.js';

function file(id: string, status: AssetFileStatus, createdAt: string): AssetFileSelection {
  return {
    id,
    assetId: 'asset-id',
    status,
    originalFilename: `${id}.png`,
    mimeType: 'image/png',
    sizeBytes: 16n,
    lastError: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

describe('pickCurrentFile', () => {
  it('prefers READY over a newer non-READY attempt', () => {
    const ready = file('ready', AssetFileStatus.READY, '2026-01-01T00:00:00Z');
    const replacement = file('replacement', AssetFileStatus.UPLOADING, '2026-01-02T00:00:00Z');

    expect(pickCurrentFile([replacement, ready])).toBe(ready);
  });

  it('picks the latest file by createdAt when none is READY', () => {
    const earlier = file('earlier', AssetFileStatus.FAILED, '2026-01-01T00:00:00Z');
    const latest = file('latest', AssetFileStatus.UPLOADING, '2026-01-02T00:00:00Z');

    expect(pickCurrentFile([latest, earlier])).toBe(latest);
  });

  it('breaks createdAt ties by descending ID', () => {
    const first = file('a', AssetFileStatus.FAILED, '2026-01-01T00:00:00Z');
    const second = file('b', AssetFileStatus.UPLOADING, '2026-01-01T00:00:00Z');

    expect(pickCurrentFile([first, second])).toBe(second);
  });

  it('returns null when there are no files', () => {
    expect(pickCurrentFile([])).toBeNull();
  });
});
