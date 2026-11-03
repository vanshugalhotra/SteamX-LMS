import { describe, expect, it } from 'vitest';
import { formatDate } from './date-helper';

describe('formatDate', () => {
  it('formats dates with the provided locale and options', () => {
    expect(
      formatDate('2026-11-02T00:00:00.000Z', 'en-GB', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }),
    ).toBe('2 Nov 2026');
  });
});
