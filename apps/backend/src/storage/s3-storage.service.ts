import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../config/env.schema.js';
import { buildContentDisposition } from './content-disposition.js';
import { assertValidKey, assertValidPrefix, StorageInvalidArgumentError } from './storage-keys.js';
import {
  assertPositiveInteger,
  MAX_DOWNLOAD_URL_TTL_SECONDS,
  MAX_SNIFF_BYTES,
  StorageObjectNotFoundError,
  StorageService,
} from './storage.service.js';

export const S3_CLIENT = Symbol('S3_CLIENT');

export interface S3StorageClientOptions {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Creates the shared S3 client; omitted credentials use the AWS SDK default provider chain. */
export function createS3Client(options: S3StorageClientOptions): S3Client {
  const clientOptions: S3ClientConfig = {
    region: options.region,
    // The SDK's default checksums break presigned browser uploads.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(options.accessKeyId &&
      options.secretAccessKey && {
        credentials: {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        },
      }),
  };

  return new S3Client(clientOptions);
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.Code === 'NotFound' ||
    candidate.Code === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

/** S3 reports a range past the end of an empty object as HTTP 416 InvalidRange. */
function isInvalidRange(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.name === 'InvalidRange' ||
    candidate.Code === 'InvalidRange' ||
    candidate.$metadata?.httpStatusCode === 416
  );
}

/** S3 implementation behind the application-facing StorageService abstraction. */
@Injectable()
export class S3StorageService extends StorageService implements OnModuleDestroy {
  private readonly bucket: string;
  private readonly uploadUrlTtlSeconds: number;

  /** Sets up the S3 client, bucket, and upload-link lifetime from injected dependencies. */
  constructor(
    config: ConfigService<Env, true>,
    @Inject(S3_CLIENT) private readonly client: S3Client,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.bucket = config.get('storage.bucket', { infer: true });
    this.uploadUrlTtlSeconds = config.get('storage.uploadUrlTtlSeconds', { infer: true });
    this.logger.setContext(S3StorageService.name);
  }

  /** Creates a temporary S3 PUT link; the browser uses it to upload the file directly to S3. */
  async createUploadUrl({
    key,
    contentType,
    sizeBytes,
  }: Parameters<StorageService['createUploadUrl']>[0]) {
    assertValidKey(key);
    assertPositiveInteger(sizeBytes, 'sizeBytes');
    if (!contentType) {
      throw new StorageInvalidArgumentError('contentType must not be empty');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const expiresIn = this.uploadUrlTtlSeconds;
    const url = await getSignedUrl(this.client, command, {
      expiresIn,
      // Force both browser-supplied values into the signature.
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    this.logger.debug({ operation: 'createUploadUrl', key, size: sizeBytes }, 'Created upload URL');
    return {
      url,
      method: 'PUT' as const,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  /** Creates a temporary S3 GET link; the browser uses it to download directly from S3. */
  async createDownloadUrl({
    key,
    expiresInSeconds,
    contentType,
    filename,
  }: Parameters<StorageService['createDownloadUrl']>[0]) {
    assertValidKey(key);
    assertPositiveInteger(expiresInSeconds, 'expiresInSeconds');
    if (expiresInSeconds > MAX_DOWNLOAD_URL_TTL_SECONDS) {
      throw new StorageInvalidArgumentError('expiresInSeconds must not exceed 12 hours');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: buildContentDisposition(filename),
      ...(contentType ? { ResponseContentType: contentType } : {}),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });

    this.logger.debug({ operation: 'createDownloadUrl', key }, 'Created download URL');
    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
    };
  }

  /** Returns an object's size and content type, or null if S3 reports it missing. */
  async head(key: string) {
    assertValidKey(key);

    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const sizeBytes = result.ContentLength ?? 0;
      this.logger.debug({ operation: 'head', key, size: sizeBytes }, 'Read storage metadata');
      return {
        sizeBytes,
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if (isMissingObject(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Reads up to the first `length` bytes of an object; `length` is capped at 4096. */
  async readFirstBytes(key: string, length: number): Promise<Buffer> {
    assertValidKey(key);
    if (!Number.isInteger(length) || length < 1 || length > MAX_SNIFF_BYTES) {
      throw new StorageInvalidArgumentError(
        `length must be an integer from 1 to ${MAX_SNIFF_BYTES}`,
      );
    }

    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=0-${length - 1}`,
        }),
      );
      const bytes = result.Body
        ? Buffer.from(await result.Body.transformToByteArray())
        : Buffer.alloc(0);
      this.logger.debug(
        { operation: 'readFirstBytes', key, size: bytes.length },
        'Read object bytes',
      );
      return bytes;
    } catch (error) {
      if (isInvalidRange(error)) {
        return Buffer.alloc(0);
      }
      if (isMissingObject(error)) {
        throw new StorageObjectNotFoundError(key);
      }
      throw error;
    }
  }

  /** The backend deletes objects under a validated S3 prefix; no browser URL is involved. */
  async deleteByPrefix(prefix: string): Promise<number> {
    assertValidPrefix(prefix);
    let continuationToken: string | undefined;
    let deletedCount = 0;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      const keys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => key !== undefined);

      // DeleteObjects accepts at most 1,000 keys per request.
      for (let offset = 0; offset < keys.length; offset += 1_000) {
        const batch = keys.slice(offset, offset + 1_000);
        if (batch.length === 0) {
          continue;
        }

        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (result.Errors && result.Errors.length > 0) {
          throw new Error(`S3 reported ${result.Errors.length} object deletion error(s)`);
        }
        deletedCount += batch.length;
      }

      // Continue only when S3 reports a subsequent page.
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    this.logger.debug(
      { operation: 'deleteByPrefix', key: prefix, size: deletedCount },
      'Deleted storage objects',
    );
    return deletedCount;
  }

  /** Closes the S3 client when Nest shuts down. */
  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
  }
}
