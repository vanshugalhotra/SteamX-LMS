import { describe, expect, it } from 'vitest';
import { InMemoryStorageService } from './in-memory-storage.service.js';

const KEY =
  'assets/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/original';

describe('InMemoryStorageService', () => {
  it('accepts the first upload to a key', () => {
    const storage = new InMemoryStorageService();

    storage.simulateUpload(KEY, {
      bytes: Buffer.from('first'),
      contentType: 'text/plain',
    });

    expect(storage.has(KEY)).toBe(true);
  });

  it('rejects a second upload to an existing key with the S3 conditional-write response', async () => {
    const storage = new InMemoryStorageService();
    storage.simulateUpload(KEY, { bytes: Buffer.from('first'), contentType: 'text/plain' });

    let error: unknown;
    try {
      storage.simulateUpload(KEY, { bytes: Buffer.from('second'), contentType: 'text/plain' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      name: 'PreconditionFailed',
      $metadata: { httpStatusCode: 412 },
    });
    await expect(storage.readFirstBytes(KEY, 16)).resolves.toEqual(Buffer.from('first'));
  });

  it('overwrites an existing key only through the explicit helper', async () => {
    const storage = new InMemoryStorageService();
    storage.simulateUpload(KEY, { bytes: Buffer.from('first'), contentType: 'text/plain' });

    storage.simulateOverwrite(KEY, {
      bytes: Buffer.from('replacement'),
      contentType: 'text/plain',
    });

    await expect(storage.readFirstBytes(KEY, 16)).resolves.toEqual(Buffer.from('replacement'));
  });
});
