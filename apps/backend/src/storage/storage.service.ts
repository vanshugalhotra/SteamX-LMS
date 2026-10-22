import { StorageInvalidArgumentError } from './storage-keys.js';

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

export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  sizeBytes: number;
}

/** A signed PUT URL plus the request method and headers the client must use. */
export interface CreateUploadUrlResult {
  url: string;
  method: 'PUT';
  headers: { 'Content-Type': string; 'If-None-Match': '*' };
  expiresAt: Date;
}

export interface CreateDownloadUrlInput {
  key: string;
  /** How long the direct S3 download link should work, in seconds (maximum 12 hours). */
  expiresInSeconds: number;
  contentType?: string;
  filename?: string;
}

export interface CreateDownloadUrlResult {
  url: string;
  expiresAt: Date;
}

/** Metadata returned by head(), or null when the object is missing. */
export interface StorageHeadResult {
  sizeBytes: number;
  contentType: string;
}

/**
 * Application-facing storage contract. Consumers depend on this abstraction rather
 * than a particular provider, so production can use S3 and tests can use an in-memory fake.
 */
export abstract class StorageService {
  abstract createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult>;

  /**
   * Creates a temporary link for downloading directly from S3.
   * Use this only when the client may access S3; app-streamed downloads do not need it.
   */
  abstract createDownloadUrl(input: CreateDownloadUrlInput): Promise<CreateDownloadUrlResult>;
  abstract head(key: string): Promise<StorageHeadResult | null>;
  abstract readFirstBytes(key: string, length: number): Promise<Buffer>;
  abstract deleteByPrefix(prefix: string): Promise<number>;
}

/** Shared argument check used by storage implementations to keep validation consistent. */
export function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StorageInvalidArgumentError(`${name} must be a positive integer`);
  }
}
