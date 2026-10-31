import { describe, expect, it } from 'vitest';
import { buildAssetListSearchParams } from './api';

describe('buildAssetListSearchParams', () => {
  it('omits empty optional filters', () => {
    expect(buildAssetListSearchParams({ page: 1, limit: 20, search: '' }).toString()).toBe(
      'page=1&limit=20',
    );
  });

  it('includes optional filters with values', () => {
    expect(
      buildAssetListSearchParams({
        page: 2,
        limit: 10,
        type: 'IMAGE',
        status: 'ACTIVE',
        fileStatus: 'READY',
        search: 'cover',
      }).toString(),
    ).toBe('page=2&limit=10&type=IMAGE&status=ACTIVE&fileStatus=READY&search=cover');
  });
});
