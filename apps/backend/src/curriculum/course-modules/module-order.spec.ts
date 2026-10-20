import { describe, expect, it } from 'vitest';
import { isValidModuleOrder } from './module-order.js';

describe('isValidModuleOrder', () => {
  it('accepts an empty order for an empty course', () => {
    expect(isValidModuleOrder([], [])).toBe(true);
  });

  it('rejects a missing module', () => {
    expect(isValidModuleOrder(['module-1'], ['module-1', 'module-2'])).toBe(false);
  });

  it('rejects an extra module', () => {
    expect(isValidModuleOrder(['module-1', 'module-2'], ['module-1'])).toBe(false);
  });

  it('rejects duplicate module IDs', () => {
    expect(isValidModuleOrder(['module-1', 'module-1'], ['module-1', 'module-2'])).toBe(false);
  });

  it('accepts a reordered exact set', () => {
    expect(isValidModuleOrder(['module-2', 'module-1'], ['module-1', 'module-2'])).toBe(true);
  });
});
