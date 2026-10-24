import type {
  CreateDownloadUrlInput,
  CreateDownloadUrlResult,
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  StorageHeadResult,
} from '../../src/storage/storage.service.js';
import {
  assertPositiveInteger,
  MAX_DOWNLOAD_URL_TTL_SECONDS,
  MAX_SNIFF_BYTES,
  StorageObjectNotFoundError,
  StorageService,
} from '../../src/storage/storage.service.js';
import {
  assertValidKey,
  assertValidPrefix,
  StorageInvalidArgumentError,
} from '../../src/storage/storage-keys.js';

/** Stored bytes and metadata used by the default test-app storage provider. */
interface StoredObject {
  bytes: Buffer;
  sizeBytes: number;
  contentType: string;
}

interface SimulatedUpload {
  bytes?: Buffer | Uint8Array;
  sizeBytes?: number;
  contentType: string;
}

/** S3-free StorageService test double; tests populate objects with simulateUpload. */
export class InMemoryStorageService extends StorageService {
  private readonly objects = new Map<string, StoredObject>();
  readonly downloadRequests: CreateDownloadUrlInput[] = [];

  constructor(private readonly uploadUrlTtlSeconds = 900) {
    super();
  }

  async createUploadUrl({
    key,
    contentType,
    sizeBytes,
  }: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    assertValidKey(key);
    assertPositiveInteger(sizeBytes, 'sizeBytes');
    if (!contentType) {
      throw new StorageInvalidArgumentError('contentType must not be empty');
    }

    return {
      url: `memory://upload/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + this.uploadUrlTtlSeconds * 1_000),
    };
  }

  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<CreateDownloadUrlResult> {
    this.downloadRequests.push({ ...input });
    const { key, expiresInSeconds } = input;
    assertValidKey(key);
    assertPositiveInteger(expiresInSeconds, 'expiresInSeconds');
    if (expiresInSeconds > MAX_DOWNLOAD_URL_TTL_SECONDS) {
      throw new StorageInvalidArgumentError('expiresInSeconds must not exceed 12 hours');
    }
    return {
      url: `memory://download/${key}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  async head(key: string): Promise<StorageHeadResult | null> {
    assertValidKey(key);
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.sizeBytes, contentType: object.contentType } : null;
  }

  async readFirstBytes(key: string, length: number): Promise<Buffer> {
    assertValidKey(key);
    if (!Number.isInteger(length) || length < 1 || length > MAX_SNIFF_BYTES) {
      throw new StorageInvalidArgumentError(
        `length must be an integer from 1 to ${MAX_SNIFF_BYTES}`,
      );
    }

    const object = this.objects.get(key);
    if (!object) {
      throw new StorageObjectNotFoundError(key);
    }
    const bytes = Buffer.alloc(Math.min(length, object.sizeBytes));
    object.bytes.copy(bytes, 0, 0, bytes.length);
    return bytes;
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    assertValidPrefix(prefix);
    let deleted = 0;
    for (const key of this.objects.keys()) {
      if (key.startsWith(prefix)) {
        this.objects.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  simulateUpload(key: string, { bytes, sizeBytes, contentType }: SimulatedUpload): void {
    assertValidKey(key);
    if (!contentType) {
      throw new StorageInvalidArgumentError('contentType must not be empty');
    }
    const objectBytes = Buffer.from(bytes ?? []);
    const actualSizeBytes = sizeBytes ?? objectBytes.length;
    if (!Number.isInteger(actualSizeBytes) || actualSizeBytes < 0) {
      throw new StorageInvalidArgumentError('sizeBytes must be a non-negative integer');
    }
    // Preserve declared size even when tests provide only a sample of the object bytes.
    this.objects.set(key, {
      bytes: objectBytes,
      sizeBytes: actualSizeBytes,
      contentType,
    });
  }

  has(key: string): boolean {
    assertValidKey(key);
    return this.objects.has(key);
  }

  keys(prefix?: string): string[] {
    if (prefix !== undefined) {
      assertValidPrefix(prefix);
    }
    return [...this.objects.keys()].filter((key) => prefix === undefined || key.startsWith(prefix));
  }
}
