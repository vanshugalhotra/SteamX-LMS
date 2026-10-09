import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from './password-policy.js';

describe('validatePasswordPolicy', () => {
  it.each([
    ['', ''],
    ['short7', ''],
    ['a'.repeat(101), ''],
    [' password123', ''],
    ['password123 ', ''],
    ['Password123', ''],
    ['ABcd9876', 'abcd'],
  ])('rejects invalid password input', (password, steamxId) => {
    expect(validatePasswordPolicy(password, steamxId)).not.toHaveLength(0);
  });

  it.each(['R4nd0m words are fine', 'long-enough!'])(
    'accepts password without composition rules: %s',
    (password) => {
      expect(validatePasswordPolicy(password, 'STEAMX-123')).toEqual([]);
    },
  );

  it('does not require a character composition mix', () => {
    expect(validatePasswordPolicy('abcdefgh', 'USER123')).toEqual([]);
  });
});
