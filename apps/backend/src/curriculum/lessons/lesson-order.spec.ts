import { describe, expect, it } from 'vitest';
import { isValidLessonOrder } from './lesson-order.js';

describe('isValidLessonOrder', () => {
  it('accepts an empty order for an empty module', () => {
    expect(isValidLessonOrder([], [])).toBe(true);
  });

  it('rejects missing, extra, and duplicate lesson IDs', () => {
    expect(isValidLessonOrder(['lesson-1'], ['lesson-1', 'lesson-2'])).toBe(false);
    expect(isValidLessonOrder(['lesson-1', 'lesson-2'], ['lesson-1'])).toBe(false);
    expect(isValidLessonOrder(['lesson-1', 'lesson-1'], ['lesson-1', 'lesson-2'])).toBe(false);
  });
});
