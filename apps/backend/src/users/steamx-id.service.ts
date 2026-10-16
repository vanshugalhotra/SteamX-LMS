/**
 * Generates a SteamX ID
 */
import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const STEAMX_ID_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
const STEAMX_ID_LENGTH = 6;

@Injectable()
export class SteamxIdService {
  async withUniqueSteamxId<T>(run: (steamxId: string) => Promise<T>): Promise<T> {
    // TODO(TEN-4 follow-up): Retry when steamx_id collides with an existing account.
    return run(this.generateCandidate());
  }

  private generateCandidate(): string {
    return Array.from({ length: STEAMX_ID_LENGTH }, () =>
      STEAMX_ID_CHARACTERS.charAt(randomInt(STEAMX_ID_CHARACTERS.length)),
    ).join('');
  }
}
