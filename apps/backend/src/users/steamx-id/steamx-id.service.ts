import { randomInt } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { isPrismaKnownError } from '../../common/errors/prisma-error.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { buildSteamxId } from './steamx-id.js';

const MAX_STEAMX_ID_ATTEMPTS = 3;

@Injectable()
export class SteamxIdService {
  async withUniqueSteamxId<T>(
    identity: { schoolCode: string; name: string },
    run: (steamxId: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_STEAMX_ID_ATTEMPTS; attempt += 1) {
      const candidate = this.generateCandidate(identity.schoolCode, identity.name);
      try {
        return await run(candidate);
      } catch (error) {
        if (!isSteamxIdUniqueViolation(error)) {
          throw error;
        }
      }
    }
    throw new ConflictException(API_ERROR.STEAMX_ID_UNAVAILABLE);
  }

  private generateCandidate(schoolCode: string, name: string): string {
    return buildSteamxId(schoolCode, name, randomInt);
  }
}

function isSteamxIdUniqueViolation(error: unknown): boolean {
  if (!isPrismaKnownError(error) || error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta;
  if (!isRecord(meta)) {
    return false;
  }

  const target = 'target' in meta ? meta.target : undefined;
  const targets = Array.isArray(target) ? target : [target];
  if (targets.some((value) => typeof value === 'string' && /steamx.?id/i.test(value))) {
    return true;
  }

  if (!('driverAdapterError' in meta) || !isRecord(meta.driverAdapterError)) {
    return false;
  }
  const adapterError = meta.driverAdapterError;
  if (!('cause' in adapterError) || !isRecord(adapterError.cause)) {
    return false;
  }
  const cause = adapterError.cause;
  if (!('constraint' in cause) || !isRecord(cause.constraint)) {
    return false;
  }

  return (
    'index' in cause.constraint &&
    typeof cause.constraint.index === 'string' &&
    /steamx.?id/i.test(cause.constraint.index)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
