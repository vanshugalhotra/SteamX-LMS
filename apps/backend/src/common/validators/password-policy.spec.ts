import { describe, expect, it } from 'vitest';
import {
  getPasswordPolicyViolations,
  PASSWORD_POLICY_VIOLATION,
  validatePasswordPolicy,
} from './password-policy.js';

describe('getPasswordPolicyViolations', () => {
  it.each(['', 'short7'])('rejects passwords below the minimum length: %s', (password) => {
    expect(getPasswordPolicyViolations(password, '')).toContain(PASSWORD_POLICY_VIOLATION.LENGTH);
  });

  it('rejects passwords longer than the maximum', () => {
    expect(getPasswordPolicyViolations('a'.repeat(101), '')).toContain(
      PASSWORD_POLICY_VIOLATION.LENGTH,
    );
  });

  it.each([' password123', 'password123 '])(
    'rejects passwords with leading or trailing whitespace: %s',
    (password) => {
      expect(getPasswordPolicyViolations(password, '')).toContain(
        PASSWORD_POLICY_VIOLATION.WHITESPACE,
      );
    },
  );

  it('rejects common passwords', () => {
    expect(getPasswordPolicyViolations('password123', '')).toContain(
      PASSWORD_POLICY_VIOLATION.COMMON,
    );
  });

  it('rejects passwords containing the SteamX ID (case-insensitive)', () => {
    expect(getPasswordPolicyViolations('ABcd9876', 'abcd')).toContain(
      PASSWORD_POLICY_VIOLATION.CONTAINS_STEAMX_ID,
    );
  });

  it('returns multiple violations when applicable', () => {
    const violations = getPasswordPolicyViolations('short', 'SHOR');
    expect(violations).toContain(PASSWORD_POLICY_VIOLATION.LENGTH);
    expect(violations).toContain(PASSWORD_POLICY_VIOLATION.CONTAINS_STEAMX_ID);
  });

  it.each(['R4nd0m words are fine', 'long-enough!'])('accepts valid password: %s', (password) => {
    expect(getPasswordPolicyViolations(password, 'STEAMX-123')).toHaveLength(0);
  });

  it('does not require a character composition mix', () => {
    expect(getPasswordPolicyViolations('abcdefgh', 'USER123')).toHaveLength(0);
  });
});

describe('validatePasswordPolicy', () => {
  it('returns human-readable messages for violations', () => {
    const messages = validatePasswordPolicy('', '');
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => typeof m === 'string')).toBe(true);
  });

  it('returns an empty array for valid passwords', () => {
    expect(validatePasswordPolicy('abcdefgh', 'USER123')).toEqual([]);
  });
});
