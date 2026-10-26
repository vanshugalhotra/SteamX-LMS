import { describe, expect, it } from 'vitest';
import { InMemoryStorageService } from './in-memory-storage.service.js';

describe('InMemoryStorageService', () => {
  it('accepts the first upload to a key', () => {
    const storage = new InMemoryStorageService();

    storage.simulateUpload('assets/asset/file/original', {
      bytes: Buffer.from('first'),
      contentType: 'text/plain',
    });

    expect(storage.has('assets/asset/file/original')).toBe(true);
  });

  it('rejects a second upload to an existing key with the S3 conditional-write response', async () => {
    const storage = new InMemoryStorageService();
    const key = 'assets/asset/file/original';
    storage.simulateUpload(key, { bytes: Buffer.from('first'), contentType: 'text/plain' });

    let error: unknown;
    try {
      storage.simulateUpload(key, { bytes: Buffer.from('second'), contentType: 'text/plain' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      name: 'PreconditionFailed',
      $metadata: { httpStatusCode: 412 },
    });
    await expect(storage.readFirstBytes(key, 16)).resolves.toEqual(Buffer.from('first'));
  });

  it('overwrites an existing key only through the explicit helper', async () => {
    const storage = new InMemoryStorageService();
    const key = 'assets/asset/file/original';
    storage.simulateUpload(key, { bytes: Buffer.from('first'), contentType: 'text/plain' });

    storage.simulateOverwrite(key, {
      bytes: Buffer.from('replacement'),
      contentType: 'text/plain',
    });

    await expect(storage.readFirstBytes(key, 16)).resolves.toEqual(Buffer.from('replacement'));
  });
});
