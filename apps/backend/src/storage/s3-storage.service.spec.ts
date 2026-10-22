import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { validateEnv } from '../config/env.schema.js';
import { StorageInvalidArgumentError } from './storage-keys.js';
import { S3StorageService, createS3Client } from './s3-storage.service.js';
import { MAX_SNIFF_BYTES, StorageObjectNotFoundError } from './storage.service.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const KEY = `assets/${UUID}/original`;

function createService(send = vi.fn()) {
  const config = new ConfigService<Env, true>(
    validateEnv({
      DATABASE_URL: 'postgresql://localhost/steamx_test',
      AUTH_JWT_SECRET: 'test-auth-secret-with-at-least-thirty-two-characters',
      AWS_REGION: 'ap-south-1',
      S3_BUCKET: 'test-bucket',
      AWS_ACCESS_KEY_ID: 'dummy-access-key',
      AWS_SECRET_ACCESS_KEY: 'dummy-secret-key',
      UPLOAD_URL_TTL_SECONDS: 321,
    }),
  );
  const client = { send } as unknown as S3Client;
  const logger = { setContext: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
  return { service: new S3StorageService(config, client, logger), send };
}

function createPresigningService() {
  const config = new ConfigService<Env, true>(
    validateEnv({
      DATABASE_URL: 'postgresql://localhost/steamx_test',
      AUTH_JWT_SECRET: 'test-auth-secret-with-at-least-thirty-two-characters',
      AWS_REGION: 'ap-south-1',
      S3_BUCKET: 'test-bucket',
      UPLOAD_URL_TTL_SECONDS: 321,
    }),
  );
  const client = createS3Client({
    region: 'ap-south-1',
    accessKeyId: 'dummy-access-key',
    secretAccessKey: 'dummy-secret-key',
  });
  const logger = { setContext: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
  return new S3StorageService(config, client, logger);
}

function makeS3Error(
  name: string,
  statusCode?: number,
): Error & {
  $metadata?: { httpStatusCode: number };
} {
  const error = new Error(name) as Error & { $metadata?: { httpStatusCode: number } };
  error.name = name;
  if (statusCode !== undefined) {
    error.$metadata = { httpStatusCode: statusCode };
  }
  return error;
}

describe('S3StorageService presigned URLs', () => {
  it('signs PUT content type and content length with the configured TTL', async () => {
    const service = createPresigningService();
    const result = await service.createUploadUrl({
      key: KEY,
      contentType: 'application/pdf',
      sizeBytes: 1234,
    });
    const url = new URL(result.url);

    expect(result.method).toBe('PUT');
    expect(result.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(url.pathname).toContain(KEY);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('321');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(
      [...url.searchParams.keys()].some((name) =>
        /x-amz-checksum|x-amz-sdk-checksum-algorithm/i.test(name),
      ),
    ).toBe(false);
  });

  it('presigns GET with response disposition and optional type', async () => {
    const service = createPresigningService();
    const { url } = await service.createDownloadUrl({
      key: KEY,
      expiresInSeconds: 120,
      contentType: 'application/pdf',
      filename: 'report; final.pdf',
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get('response-content-disposition')).toContain(
      'filename="report__final.pdf"',
    );
    expect(parsed.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('120');
  });

  it.each([0, -1, 1.5, 12 * 60 * 60 + 1])('rejects download TTL %s', async (expiresInSeconds) => {
    const { service } = createService();
    await expect(service.createDownloadUrl({ key: KEY, expiresInSeconds })).rejects.toThrow(
      StorageInvalidArgumentError,
    );
  });

  it('rejects non-positive and non-integer upload sizes', async () => {
    const { service } = createService();
    for (const sizeBytes of [0, -1, 1.5]) {
      await expect(
        service.createUploadUrl({ key: KEY, contentType: 'text/plain', sizeBytes }),
      ).rejects.toThrow(StorageInvalidArgumentError);
    }
  });
});

describe('S3StorageService object operations', () => {
  it('returns null when HEAD reports a missing object and rethrows other errors', async () => {
    const { service, send } = createService();
    send.mockRejectedValueOnce(makeS3Error('NotFound', 404));
    await expect(service.head(KEY)).resolves.toBeNull();

    const failure = new Error('S3 unavailable');
    send.mockRejectedValueOnce(failure);
    await expect(service.head(KEY)).rejects.toBe(failure);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('reads only the requested byte range', async () => {
    const { service, send } = createService();
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3]) },
    });

    await expect(service.readFirstBytes(KEY, 3)).resolves.toEqual(Buffer.from([1, 2, 3]));
    const command = send.mock.calls[0]?.[0] as GetObjectCommand;
    expect(command.input.Range).toBe('bytes=0-2');
  });

  it('rejects invalid sniff lengths', async () => {
    const { service, send } = createService();
    for (const length of [0, -1, 1.5, MAX_SNIFF_BYTES + 1]) {
      await expect(service.readFirstBytes(KEY, length)).rejects.toThrow(
        StorageInvalidArgumentError,
      );
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('returns a short body unchanged', async () => {
    const { service, send } = createService();
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Uint8Array.from([7, 8]) },
    });
    await expect(service.readFirstBytes(KEY, 12)).resolves.toEqual(Buffer.from([7, 8]));
  });

  it('returns empty bytes for an empty object range response', async () => {
    const { service, send } = createService();
    send.mockRejectedValueOnce(makeS3Error('InvalidRange', 416));
    await expect(service.readFirstBytes(KEY, 12)).resolves.toEqual(Buffer.alloc(0));
  });

  it('maps a missing GET object to StorageObjectNotFoundError', async () => {
    const { service, send } = createService();
    send.mockRejectedValueOnce(makeS3Error('NoSuchKey', 404));
    await expect(service.readFirstBytes(KEY, 12)).rejects.toThrow(StorageObjectNotFoundError);
  });

  it('paginates deletion across list pages', async () => {
    const { service, send } = createService();
    const pages = [
      {
        Contents: [{ Key: `${KEY}/one` }],
        IsTruncated: true,
        NextContinuationToken: 'page-two',
      },
      {
        Contents: [{ Key: `${KEY}/two` }],
        IsTruncated: true,
        NextContinuationToken: 'page-three',
      },
      { Contents: [{ Key: `${KEY}/three` }], IsTruncated: false },
    ];
    let pageIndex = 0;
    send.mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        return pages[pageIndex++];
      }
      return {};
    });

    await expect(service.deleteByPrefix(`assets/${UUID}/`)).resolves.toBe(3);
    const listCommands = send.mock.calls.flatMap(([command]) =>
      command instanceof ListObjectsV2Command ? [command] : [],
    );
    expect(listCommands).toHaveLength(3);
    expect(
      send.mock.calls.filter(([command]) => command instanceof DeleteObjectsCommand),
    ).toHaveLength(3);
    expect(listCommands.map((command) => command.input.ContinuationToken)).toEqual([
      undefined,
      'page-two',
      'page-three',
    ]);
  });

  it('batches delete requests at 1000 objects', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({
        Contents: Array.from({ length: 2_001 }, (_, index) => ({ Key: `${KEY}/${index}` })),
        IsTruncated: false,
      })
      .mockResolvedValue({ Errors: [] });

    await expect(service.deleteByPrefix(`assets/${UUID}/`)).resolves.toBe(2_001);
    const batches = send.mock.calls
      .filter(([command]) => command instanceof DeleteObjectsCommand)
      .map(([command]) => (command as DeleteObjectsCommand).input.Delete?.Objects?.length);
    expect(batches).toEqual([1_000, 1_000, 1]);
  });

  it('throws when S3 reports per-object delete errors', async () => {
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({ Contents: [{ Key: `${KEY}/one` }], IsTruncated: false })
      .mockResolvedValueOnce({ Errors: [{ Key: `${KEY}/one`, Code: 'AccessDenied' }] });
    await expect(service.deleteByPrefix(`assets/${UUID}/`)).rejects.toThrow(
      'S3 reported 1 object deletion error(s)',
    );
  });

  it('does not call DeleteObjects when no objects are found', async () => {
    const { service, send } = createService();
    send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    await expect(service.deleteByPrefix(`assets/${UUID}/`)).resolves.toBe(0);
    expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectsCommand)).toBe(
      false,
    );
  });

  it('rejects an invalid prefix before contacting S3', async () => {
    const { service, send } = createService();
    await expect(service.deleteByPrefix('assets/')).rejects.toThrow(StorageInvalidArgumentError);
    expect(send).not.toHaveBeenCalled();
  });
});
