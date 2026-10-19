import { describe, expect, it, vi } from 'vitest';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { SteamxIdService } from './steamx-id.service.js';

describe('SteamxIdService.withUniqueSteamxId', () => {
  // A successful operation returns its result and is not repeated.
  it('returns the first successful result without retrying', async () => {
    const run = vi.fn().mockResolvedValue('created');

    await expect(service().withUniqueSteamxId(identity, run)).resolves.toBe('created');
    expect(run).toHaveBeenCalledOnce();
  });

  // Only a SteamX-ID unique collision is retried, and the next candidate can succeed.
  it('retries a SteamX ID collision and returns the successful result', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation('steamx_id'))
      .mockResolvedValueOnce('created');

    await expect(service().withUniqueSteamxId(identity, run)).resolves.toBe('created');
    expect(run).toHaveBeenCalledTimes(2);
  });

  // Exhausted collision retries return a stable public conflict instead of the database error.
  it('stops after the retry cap with the unavailable error', async () => {
    const run = vi.fn().mockRejectedValue(uniqueViolation('steamx_id'));

    await expect(service().withUniqueSteamxId(identity, run)).rejects.toMatchObject({
      response: API_ERROR.STEAMX_ID_UNAVAILABLE,
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  // A unique collision on another field must not be mistaken for an ID collision.
  it('rethrows an email unique violation without retrying', async () => {
    const error = uniqueViolation('email');
    const run = vi.fn().mockRejectedValue(error);

    await expect(service().withUniqueSteamxId(identity, run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledOnce();
  });

  // Non-unique database errors propagate unchanged and are never retried.
  it('rethrows unrelated failures without retrying', async () => {
    const error = new Error('database unavailable');
    const run = vi.fn().mockRejectedValue(error);

    await expect(service().withUniqueSteamxId(identity, run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledOnce();
  });
});

const identity = { schoolCode: 'GVS', name: 'Ada Lovelace' };

function service(): SteamxIdService {
  return new SteamxIdService();
}

function uniqueViolation(target: string): Error {
  return Object.assign(new Error('unique violation'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2002',
    meta: { target: [target] },
  });
}
