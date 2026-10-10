import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with Argon2id and verifies the correct password', async () => {
    const encodedHash = await passwords.hash('correct horse battery staple');

    expect(encodedHash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(encodedHash, 'correct horse battery staple')).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const encodedHash = await passwords.hash('correct horse battery staple');

    await expect(passwords.verify(encodedHash, 'incorrect horse battery staple')).resolves.toBe(
      false,
    );
  });

  it.each([null, undefined, '', 'not-a-hash', '$argon2id$invalid'])(
    'returns false for a missing or malformed hash',
    async (encodedHash) => {
      await expect(passwords.verify(encodedHash, 'some password')).resolves.toBe(false);
    },
  );
});
