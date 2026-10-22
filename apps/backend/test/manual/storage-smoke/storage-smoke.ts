import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { validateEnv } from '../../../src/config/env.schema.js';
import { S3StorageService, createS3Client } from '../../../src/storage/s3-storage.service.js';
import { StorageInvalidArgumentError } from '../../../src/storage/storage-keys.js';
import type { Env } from '../../../src/config/env.schema.js';

const DEFAULT_PORT = 5173;
const MAX_PORT = 65535;
const assetId = randomUUID();
const key = `assets/${assetId}/smoke/test.bin`;
const prefix = `assets/${assetId}/`;
const downloadFilename = 'smoke-"quote"-ñ.bin';

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function getPort(args: string[]): number {
  const portIndex = args.indexOf('--port');
  if (portIndex < 0) return DEFAULT_PORT;

  const port = Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error('--port must be an integer between 1 and 65535');
  }
  return port;
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UnknownError';
  const candidate = error as { name?: string; Code?: string };
  return candidate.Code ?? candidate.name ?? 'UnknownError';
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { message?: string; Message?: string };
  const message = candidate.Message ?? candidate.message;
  return typeof message === 'string' ? message.slice(0, 300) : undefined;
}

function errorStatus(error: unknown): number {
  if (error instanceof StorageInvalidArgumentError) return 400;
  if (typeof error === 'object' && error !== null) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status) return status;
  }
  return 500;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    log('Usage: pnpm storage:smoke [--port <allowed-free-port>]');
    return;
  }

  const port = getPort(args);
  const env = validateEnv(process.env);
  const config = new ConfigService<Env, true>(env);
  const client = createS3Client({
    region: env.storage.region,
    accessKeyId: env.storage.accessKeyId,
    secretAccessKey: env.storage.secretAccessKey,
  });
  const storage = new S3StorageService(config, client, new PinoLogger({}));
  let closing = false;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);

    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(await readFile(new URL('./index.html', import.meta.url)));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/browser.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        response.end(await readFile(new URL('./browser.js', import.meta.url)));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/presign') {
        const sizeBytes = Number(url.searchParams.get('size'));
        const contentType = url.searchParams.get('type') ?? '';
        if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || !contentType) {
          throw new StorageInvalidArgumentError('size and type are required and must be valid');
        }
        const upload = await storage.createUploadUrl({ key, contentType, sizeBytes });
        sendJson(response, 200, { ...upload, key });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/download-url') {
        const download = await storage.createDownloadUrl({
          key,
          expiresInSeconds: 300,
          filename: downloadFilename,
        });
        const objectPath = key.split('/').map(encodeURIComponent).join('/');
        const plainUrl = `https://s3.${env.storage.region}.amazonaws.com/${env.storage.bucket}/${objectPath}`;
        sendJson(response, 200, { ...download, plainUrl });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/verify') {
        const head = await storage.head(key);
        if (!head) {
          sendJson(response, 404, { errorCode: 'NotFound' });
          return;
        }
        const bytes = await storage.readFirstBytes(key, 16);
        sendJson(response, 200, { head, firstBytesHex: bytes.toString('hex') });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/cleanup') {
        sendJson(response, 200, { deleted: await storage.deleteByPrefix(prefix) });
        return;
      }
      sendJson(response, 404, { errorCode: 'NotFound' });
    } catch (error) {
      sendJson(response, errorStatus(error), {
        errorCode: errorCode(error),
        message: errorMessage(error),
      });
    }
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 0;
    log('Stopping the smoke server and cleaning up its S3 prefix...');
    try {
      const deleted = await storage.deleteByPrefix(prefix);
      log(`Cleaned ${deleted} smoke object(s).`);
    } catch (error) {
      process.exitCode = 1;
      logError(`Automatic cleanup failed (S3 error: ${errorCode(error)}).`);
    } finally {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      await storage.onModuleDestroy();
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  server.listen(port, '127.0.0.1', () => {
    log(`Storage smoke test for key ${key}`);
    log(`Open http://localhost:${port} in the browser.`);
    log('Press Ctrl+C to stop; the smoke prefix will be deleted on shutdown.');
  });
  server.on('error', async (error) => {
    logError(`Could not start local smoke server: ${error.message}`);
    await storage.onModuleDestroy();
    process.exitCode = 1;
  });
}

main().catch((error: unknown) => {
  logError(`Storage smoke test could not start: ${errorCode(error)}`);
  process.exitCode = 1;
});
