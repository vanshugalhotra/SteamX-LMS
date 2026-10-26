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
