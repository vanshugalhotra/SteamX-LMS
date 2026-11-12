import { describe, expect, it } from 'vitest';
import { buildCourseListSearchParams } from './api';

describe('buildCourseListSearchParams', () => {
  it('omits empty optional filters', () => {
    expect(
      buildCourseListSearchParams({ page: 1, limit: 20, q: '', status: undefined }).toString(),
    ).toBe('page=1&limit=20');
  });

  it('includes optional filters with values', () => {
    expect(
      buildCourseListSearchParams({
        page: 2,
        limit: 10,
        q: 'science',
        status: 'ACTIVE',
      }).toString(),
    ).toBe('page=2&limit=10&q=science&status=ACTIVE');
  });
});
