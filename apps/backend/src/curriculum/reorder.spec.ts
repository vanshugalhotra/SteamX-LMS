import { describe, expect, it } from 'vitest';
import { isValidReorder } from './reorder.js';

describe('isValidReorder', () => {
  it('accepts an empty order for an empty parent', () => {
    expect(isValidReorder([], [])).toBe(true);
  });

  it('rejects a missing ID', () => {
    expect(isValidReorder(['a'], ['a', 'b'])).toBe(false);
  });

  it('rejects an extra ID', () => {
    expect(isValidReorder(['a', 'b'], ['a'])).toBe(false);
  });

  it('rejects duplicate IDs', () => {
    expect(isValidReorder(['a', 'a'], ['a', 'b'])).toBe(false);
  });

  it('accepts a reordered exact set', () => {
    expect(isValidReorder(['b', 'a'], ['a', 'b'])).toBe(true);
  });
});
