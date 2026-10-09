import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes passwords with Argon2id and verifies the correct password', async () => {
    const encodedHash = await passwords.hash('correct horse battery staple');

    expect(encodedHash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify('correct horse battery staple', encodedHash)).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const encodedHash = await passwords.hash('correct horse battery staple');

    await expect(passwords.verify('incorrect horse battery staple', encodedHash)).resolves.toBe(
      false,
    );
  });

  it.each([null, undefined, '', 'not-a-hash', '$argon2id$invalid'])(
    'returns false for a missing or malformed hash',
    async (encodedHash) => {
      await expect(passwords.verify('some password', encodedHash)).resolves.toBe(false);
    },
  );
});
