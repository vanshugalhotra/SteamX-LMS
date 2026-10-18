/** Provides the shared Argon2 password hash and verification policy. */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Algorithm, Version } from '@node-rs/argon2';
import { Injectable, OnModuleInit } from '@nestjs/common';

const ARGON2ID_ALGORITHM: Algorithm = 2;
const ARGON2_VERSION_19: Version = 1;
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  version: ARGON2_VERSION_19,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;
const DUMMY_PASSWORD = 'steamx-invalid-user-dummy-password';

// Reuse one expensive hash so unknown users still incur the normal password verification cost.
// Without it, unknown IDs would skip Argon2 work and could be identified by faster login responses.
let dummyHashPromise: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argonHash(DUMMY_PASSWORD, ARGON2_OPTIONS);
  return dummyHashPromise;
}

/** Centralizes Argon2 hashing and keeps failed-login work comparable for unknown accounts. */
@Injectable()
export class PasswordService implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await getDummyHash();
  }

  hash(password: string): Promise<string> {
    return argonHash(password, ARGON2_OPTIONS);
  }

  /** Returns false for absent, malformed, or unverifiable hashes after dummy verification work. */
  async verify(encodedHash: string | null | undefined, password: string): Promise<boolean> {
    if (typeof encodedHash !== 'string' || !encodedHash.startsWith('$argon2id$')) {
      await this.verifyDummy(password);
      return false;
    }

    try {
      return await argonVerify(encodedHash, password);
    } catch {
      await this.verifyDummy(password);
      return false;
    }
  }

  private async verifyDummy(password: string): Promise<void> {
    try {
      await argonVerify(await getDummyHash(), password);
    } catch {
      return;
    }
  }
}
