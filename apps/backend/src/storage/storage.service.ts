import { StorageInvalidArgumentError } from './storage-keys.js';
import type {
  CreateDownloadUrlInput,
  CreateDownloadUrlResult,
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  StorageHeadResult,
} from './storage.types.js';

export type {
  CreateDownloadUrlInput,
  CreateDownloadUrlResult,
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  StorageHeadResult,
} from './storage.types.js';

export const MAX_SNIFF_BYTES = 4096; // Enough for magic-byte checks.

// Keep a download link valid for no more than 12 hours.
export const MAX_DOWNLOAD_URL_TTL_SECONDS = 12 * 60 * 60;

/** Raised when an expected storage object does not exist. */
export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = StorageObjectNotFoundError.name;
  }
}

/**
 * Application-facing storage contract. Consumers depend on this abstraction rather
 * than a particular provider, so production can use S3 and tests can use an in-memory fake.
 */
export abstract class StorageService {
  /**
   * Creates a one-shot presigned PUT URL. The URL includes `If-None-Match: *`, so S3
   * rejects the upload with 412 if an object already exists at the key. Callers must
   * generate a new key for each retry — reusing the same key after a successful upload
   * will always fail.
   */
  abstract createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult>;

  /**
   * Creates a temporary link for downloading directly from S3.
   * Use this only when the client may access S3; app-streamed downloads do not need it.
   */
  abstract createDownloadUrl(input: CreateDownloadUrlInput): Promise<CreateDownloadUrlResult>;

  /** Reads object size and content type; returns null only when the key is missing. */
  abstract head(key: string): Promise<StorageHeadResult | null>;

  /** Reads a bounded prefix sample for upload signature verification. */
  abstract readFirstBytes(key: string, length: number): Promise<Buffer>;

  /** Deletes every object under a validated prefix and returns the number removed. */
  abstract deleteByPrefix(prefix: string): Promise<number>;
}

/** Shared argument check used by storage implementations to keep validation consistent. */
export function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StorageInvalidArgumentError(`${name} must be a positive integer`);
  }
}
