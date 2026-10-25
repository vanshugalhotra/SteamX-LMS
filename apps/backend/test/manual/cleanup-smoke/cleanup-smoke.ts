import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { Env } from '../../../src/config/env.schema.js';
import { configureApp } from '../../../src/configure-app.js';
import { AssetCleanupService } from '../../../src/assets/cleanup/asset-cleanup.service.js';
import { buildOriginalKey } from '../../../src/assets/asset-rules.js';
import { CleanupScheduler } from '../../../src/assets/cleanup/cleanup-scheduler.js';
import { AssetFileStatus, AssetType } from '../../../src/generated/prisma/client.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { StorageCleanupQueueService } from '../../../src/storage/storage-cleanup-queue.service.js';
import { StorageService } from '../../../src/storage/storage.service.js';
import { AppModule } from '../../../src/app.module.js';
import { cleanupFixtures } from '../../support/setup/cleanup.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../../support/factories/fixtures.js';
import { loginAsCookie } from '../../support/login.js';

const DEFAULT_PORT = 5180;
const MAX_PORT = 65535;
const UPLOAD_URL_LATE_PUT_GRACE_SECONDS = 300;
const TITLE_PREFIX = '__cleanup-smoke__';
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

interface SmokeResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
  elapsedMs: number;
}

interface UploadedAsset {
  assetId: string;
  fileId: string;
  storageKey: string;
}

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SteamX cleanup smoke test</title>
    <style>
      body { font: 16px system-ui, sans-serif; margin: 2rem auto; max-width: 900px; padding: 0 1rem; }
      button { margin: .25rem; padding: .6rem .9rem; }
      table { border-collapse: collapse; margin-top: 1rem; width: 100%; }
      th, td { border: 1px solid #bbb; padding: .6rem; text-align: left; vertical-align: top; }
      .PASS { color: #176b2b; font-weight: 700; }
      .FAIL { color: #a11; font-weight: 700; }
      pre { margin: 0; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>SteamX cleanup smoke test</h1>
    <p>Tests the local API database and configured staging bucket. Presigned URLs are never displayed.</p>
    <div id="buttons"></div>
    <table>
      <thead><tr><th>Case</th><th>Result</th><th>Elapsed</th><th>Details</th></tr></thead>
      <tbody id="results"></tbody>
    </table>
    <script>
      const cases = [
        ['eligible-queue', 'Eligible prefix queue'],
        ['young-queue', 'Not-yet-eligible queue'],
        ['poison-queue', 'Poison entries and paging'],
        ['abandoned-upload', 'Abandoned upload cleanup'],
        ['retained-files', 'READY and fresh files retained'],
        ['scheduled-tick', 'Scheduled cleanup tick'],
        ['delete-route', 'CUR-14 asset DELETE route'],
        ['replacement-route', 'CUR-13 replacement cleanup']
      ];
      const buttons = document.getElementById('buttons');
      const tbody = document.getElementById('results');
      for (const [id, name] of cases) {
        const button = document.createElement('button');
        button.textContent = name;
        button.onclick = () => run('/run/' + id);
        buttons.append(button);
      }
      const all = document.createElement('button');
      all.textContent = 'Run all';
      all.onclick = () => run('/run-all');
      buttons.append(all);
      const clean = document.createElement('button');
      clean.textContent = 'Clean up what this script created';
      clean.onclick = () => run('/cleanup');
      buttons.append(clean);

      function render(result) {
        for (const item of Array.isArray(result) ? result : [result]) {
          let row = document.getElementById('result-' + item.id);
          if (!row) {
            row = document.createElement('tr');
            row.id = 'result-' + item.id;
            tbody.append(row);
          }
          row.innerHTML = '<td></td><td></td><td></td><td><pre></pre></td>';
          row.cells[0].textContent = item.name;
          row.cells[1].textContent = item.passed ? 'PASS' : 'FAIL';
          row.cells[1].className = item.passed ? 'PASS' : 'FAIL';
          row.cells[2].textContent = item.elapsedMs + ' ms';
          row.cells[3].firstChild.textContent = item.details;
        }
      }
      async function run(path) {
        const response = await fetch(path, { method: 'POST' });
        const result = await response.json();
        render(result);
      }
    </script>
  </body>
</html>`;

const smokeCases = [
  { id: 'eligible-queue', name: 'Eligible prefix queue' },
  { id: 'young-queue', name: 'Not-yet-eligible queue' },
  { id: 'poison-queue', name: 'Poison entries and paging' },
  { id: 'abandoned-upload', name: 'Abandoned upload cleanup' },
  { id: 'retained-files', name: 'READY and fresh files retained' },
  { id: 'scheduled-tick', name: 'Scheduled cleanup tick' },
  { id: 'delete-route', name: 'CUR-14 asset DELETE route' },
  { id: 'replacement-route', name: 'CUR-13 replacement cleanup' },
] as const;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, '[redacted URL]');
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

function assertSafeDatabaseHost(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', 'postgres'].includes(database.hostname.toLowerCase())
  ) {
    throw new Error(
      'Refusing to start: DATABASE_URL host must be localhost, 127.0.0.1, or postgres.',
    );
  }
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
    log('Usage: pnpm cleanup:smoke [-- --port <port>]');
    return;
  }
  assertSafeDatabaseHost(process.env.DATABASE_URL);
  const port = getPort(args);
  process.env.CLEANUP_ENABLED = 'false';
  process.env.CLEANUP_INTERVAL_SECONDS = '10';

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app, { enableShutdownHooks: false });
  await app.init();

  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);
  const queue = app.get(StorageCleanupQueueService);
  const assetCleanup = app.get(AssetCleanupService);
  const scheduler = app.get(CleanupScheduler);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const uploadUrlTtlSeconds = config.get('storage.uploadUrlTtlSeconds', { infer: true });
  const origin = config.get('CORS_ORIGINS', { infer: true })[0];
  if (!origin) {
    await app.close();
    throw new Error('CORS_ORIGINS must include an allowed origin for the API smoke cases.');
  }
  const requestOrigin = origin;

  let fixture: TwoSchoolFixture | undefined;
  let adminCookie: string | undefined;
  const createdAssetIds = new Set<string>();
  const createdFileIds = new Set<string>();
  const createdQueueIds = new Set<string>();
  const createdPrefixes = new Set<string>();
  async function ensureAdmin(): Promise<string> {
    if (!fixture) {
      fixture = await createTwoSchoolFixture(prisma);
      adminCookie = await loginAsCookie(app, fixture.admin);
    }
    if (!adminCookie) {
      throw new Error('Smoke test administrator login is unavailable.');
    }
    return adminCookie;
  }

  function trackAsset(assetId: string, fileId?: string): void {
    createdAssetIds.add(assetId);
    createdPrefixes.add(`assets/${assetId}/`);
    if (fileId) {
      createdFileIds.add(fileId);
    }
  }

  function assetRootPrefix(prefix: string): string {
    return `assets/${prefix.split('/')[1]}/`;
  }

  async function uploadObject(key: string, bytes = PNG_BYTES): Promise<void> {
    const upload = await storage.createUploadUrl({
      key,
      contentType: 'image/png',
      sizeBytes: bytes.length,
    });
    const response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: bytes,
    });
    if (!response.ok) {
      throw new Error(`S3 test upload failed with status ${response.status}.`);
    }
  }

  async function createApiUpload(title: string): Promise<UploadedAsset> {
    const cookie = await ensureAdmin();
    const response = await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Origin', requestOrigin)
      .set('Cookie', cookie)
      .send({
        type: AssetType.IMAGE,
        title: `${TITLE_PREFIX}${title}-${randomUUID()}`,
        filename: `${title}.png`,
        mimeType: 'image/png',
        sizeBytes: PNG_BYTES.length,
      })
      .expect(201);
    const { asset, file } = response.body as {
      asset: { id: string };
      file: { id: string };
    };
    trackAsset(asset.id, file.id);
    return {
      assetId: asset.id,
      fileId: file.id,
      storageKey: buildOriginalKey(asset.id, file.id),
    };
  }

  async function uploadAndComplete(asset: UploadedAsset): Promise<void> {
    await uploadObject(asset.storageKey);
    const cookie = await ensureAdmin();
    await request(app.getHttpServer())
      .post(`/api/v1/assets/${asset.assetId}/files/${asset.fileId}/complete`)
      .set('Origin', requestOrigin)
      .set('Cookie', cookie)
      .expect(200);
  }

  async function createQueueEntry(
    objectKey: string,
    options: { isPrefix?: boolean; queuedAt?: Date; doneAt?: Date } = {},
  ): Promise<{ id: string }> {
    const entry = await prisma.storageCleanupQueue.create({
      data: {
        objectKey,
        isPrefix: options.isPrefix ?? true,
        queuedAt: options.queuedAt ?? new Date(),
        doneAt: options.doneAt,
      },
    });
    createdQueueIds.add(entry.id);
    return entry;
  }

  async function assertNoUnownedEligiblePrefixes(): Promise<void> {
    const cutoff = new Date(
      Date.now() - (uploadUrlTtlSeconds + UPLOAD_URL_LATE_PUT_GRACE_SECONDS) * 1_000,
    );
    const eligible = await prisma.storageCleanupQueue.findMany({
      where: { isPrefix: true, doneAt: null, queuedAt: { lte: cutoff } },
      select: { id: true, objectKey: true },
    });
    const unexpected = eligible.filter(
      (entry) =>
        !createdQueueIds.has(entry.id) &&
        ![...createdPrefixes].some((prefix) => entry.objectKey.startsWith(prefix)),
    );
    if (unexpected.length > 0) {
      throw new Error(
        `Refusing to drain: ${unexpected.length} eligible queue entry/entries were not created by this script.`,
      );
    }
  }

  async function assertNoUnownedAssetCleanupCandidates(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        config.get('cleanup.assetStaleFileAfterHours', { infer: true }) * 60 * 60 * 1_000,
    );
    const staleFiles = await prisma.assetFile.findMany({
      where: { status: { not: AssetFileStatus.READY }, updatedAt: { lt: cutoff } },
      select: { id: true, assetId: true },
    });
    const foreignFiles = staleFiles.filter(
      (file) => !createdFileIds.has(file.id) || !createdAssetIds.has(file.assetId),
    );
    const ghosts = await prisma.asset.findMany({
      where: { files: { none: {} }, blocks: { none: {} } },
      select: { id: true },
    });
    const foreignGhosts = ghosts.filter((asset) => !createdAssetIds.has(asset.id));
    if (foreignFiles.length > 0 || foreignGhosts.length > 0) {
      throw new Error(
        `Refusing asset cleanup: found ${foreignFiles.length} stale file(s) and ${foreignGhosts.length} unowned ghost asset(s).`,
      );
    }
  }

  async function drainOwnEntries(options?: Parameters<StorageCleanupQueueService['drain']>[0]) {
    await assertNoUnownedEligiblePrefixes();
    return queue.drain(options);
  }

  async function cleanupOwnAssets() {
    await assertNoUnownedAssetCleanupCandidates();
    return assetCleanup.run();
  }

  function makeCase(
    id: (typeof smokeCases)[number]['id'],
    run: () => Promise<string>,
  ): () => Promise<SmokeResult> {
    const name = smokeCases.find((item) => item.id === id)!.name;
    return async () => {
      const started = Date.now();
      try {
        const details = await run();
        return { id, name, passed: true, details, elapsedMs: Date.now() - started };
      } catch (error) {
        return {
          id,
          name,
          passed: false,
          details: safeMessage(error),
          elapsedMs: Date.now() - started,
        };
      }
    };
  }

  const cases: Record<(typeof smokeCases)[number]['id'], () => Promise<SmokeResult>> = {
    'eligible-queue': makeCase('eligible-queue', async () => {
      const prefix = `assets/${randomUUID().toLowerCase()}/${randomUUID().toLowerCase()}/`;
      createdPrefixes.add(assetRootPrefix(prefix));
      const key = `${prefix}original`;
      await uploadObject(key);
      const entry = await createQueueEntry(prefix, {
        queuedAt: new Date(Date.now() - 60 * 60 * 1_000),
      });
      await drainOwnEntries();
      const saved = await prisma.storageCleanupQueue.findUnique({ where: { id: entry.id } });
      const object = await storage.head(key);
      if (!saved?.doneAt || object) {
        throw new Error(
          'Expected the eligible queue row to complete and its S3 object to be gone.',
        );
      }
      return 'Queue entry completed; its test object is absent from S3.';
    }),
    'young-queue': makeCase('young-queue', async () => {
      const prefix = `assets/${randomUUID().toLowerCase()}/${randomUUID().toLowerCase()}/`;
      createdPrefixes.add(assetRootPrefix(prefix));
      const key = `${prefix}original`;
      await uploadObject(key);
      const entry = await createQueueEntry(prefix);
      await drainOwnEntries();
      const saved = await prisma.storageCleanupQueue.findUnique({ where: { id: entry.id } });
      if (saved?.doneAt || !(await storage.head(key))) {
        throw new Error(
          'A new queue entry or its test object changed before the URL expiry delay.',
        );
      }
      return 'Young queue entry remains pending and its test object remains in S3.';
    }),
    'poison-queue': makeCase('poison-queue', async () => {
      const firstPoisonPrefix = `assets/${randomUUID().toLowerCase()}/bad prefix/`;
      const secondPoisonPrefix = `assets/${randomUUID().toLowerCase()}/bad prefix/`;
      createdPrefixes.add(assetRootPrefix(firstPoisonPrefix));
      createdPrefixes.add(assetRootPrefix(secondPoisonPrefix));
      const firstPoison = await createQueueEntry(firstPoisonPrefix, {
        queuedAt: new Date(Date.now() - 60 * 60 * 1_000),
      });
      const secondPoison = await createQueueEntry(secondPoisonPrefix, {
        queuedAt: new Date(Date.now() - 60 * 60 * 1_000 + 1),
      });
      const prefix = `assets/${randomUUID().toLowerCase()}/${randomUUID().toLowerCase()}/`;
      createdPrefixes.add(assetRootPrefix(prefix));
      const key = `${prefix}original`;
      await uploadObject(key);
      const good = await createQueueEntry(prefix, {
        queuedAt: new Date(Date.now() - 60 * 60 * 1_000 + 2),
      });
      const skipped = await createQueueEntry(`${prefix}object`, {
        isPrefix: false,
        queuedAt: new Date(Date.now() - 60 * 60 * 1_000),
      });
      const result = await drainOwnEntries({ batchSize: 2, maxBatches: 2 });
      const goodRow = await prisma.storageCleanupQueue.findUnique({ where: { id: good.id } });
      const skippedRow = await prisma.storageCleanupQueue.findUnique({ where: { id: skipped.id } });
      if (
        result.failed !== 2 ||
        result.done !== 1 ||
        result.skipped !== 1 ||
        !goodRow?.doneAt ||
        skippedRow?.doneAt ||
        (await storage.head(key))
      ) {
        throw new Error(
          'Poison entries blocked the valid entry or the non-prefix entry was processed.',
        );
      }
      for (const poison of [firstPoison, secondPoison]) {
        const row = await prisma.storageCleanupQueue.findUnique({ where: { id: poison.id } });
        if (row?.doneAt) throw new Error('A failed poison entry was marked done.');
      }
      return 'Both poison rows stayed pending; the later prefix was deleted; non-prefix work was skipped.';
    }),
    'abandoned-upload': makeCase('abandoned-upload', async () => {
      const upload = await createApiUpload('abandoned');
      await uploadObject(upload.storageKey);
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1_000);
      await prisma.assetFile.update({
        where: { id: upload.fileId },
        data: { updatedAt: oldTime },
      });
      const result = await cleanupOwnAssets();
      if (result.staleFilesDeleted !== 1) {
        throw new Error(
          `Expected one stale upload file to be removed; got ${result.staleFilesDeleted}.`,
        );
      }
      const row = await prisma.storageCleanupQueue.findFirst({
        where: { objectKey: `assets/${upload.assetId}/${upload.fileId}/` },
      });
      if (!row) throw new Error('Stale file deletion did not enqueue its prefix.');
      const eligibleAt = new Date(Date.now() - 60 * 60 * 1_000);
      await prisma.storageCleanupQueue.update({
        where: { id: row.id },
        data: { queuedAt: eligibleAt },
      });
      await drainOwnEntries();
      if (
        (await prisma.assetFile.findUnique({ where: { id: upload.fileId } })) ||
        (await prisma.asset.findUnique({ where: { id: upload.assetId } })) ||
        !(await prisma.storageCleanupQueue.findUnique({ where: { id: row.id } }))?.doneAt ||
        (await storage.head(upload.storageKey))
      ) {
        throw new Error('Abandoned upload records or object were not fully cleaned.');
      }
      return 'Stale file and empty asset were removed; the trigger-queued S3 prefix was deleted.';
    }),
    'retained-files': makeCase('retained-files', async () => {
      const ready = await createApiUpload('ready-retained');
      await uploadObject(ready.storageKey);
      await prisma.assetFile.update({
        where: { id: ready.fileId },
        data: { status: AssetFileStatus.UPLOADED },
      });
      await prisma.$executeRaw`
        UPDATE "asset_files"
        SET "status" = 'READY', "updated_at" = ${new Date(Date.now() - 48 * 60 * 60 * 1_000)}
        WHERE "id" = ${ready.fileId}::uuid
      `;
      const fresh = await createApiUpload('fresh-retained');
      await cleanupOwnAssets();
      const readyAfter = await prisma.assetFile.findUnique({ where: { id: ready.fileId } });
      const freshAfter = await prisma.assetFile.findUnique({ where: { id: fresh.fileId } });
      if (
        readyAfter?.status !== AssetFileStatus.READY ||
        freshAfter?.status !== AssetFileStatus.UPLOADING
      ) {
        throw new Error('Cleanup removed a READY file or a fresh UPLOADING file.');
      }
      return 'Old READY file and fresh UPLOADING file both remain.';
    }),
    'scheduled-tick': makeCase('scheduled-tick', async () => {
      const prefix = `assets/${randomUUID().toLowerCase()}/${randomUUID().toLowerCase()}/`;
      createdPrefixes.add(assetRootPrefix(prefix));
      const key = `${prefix}original`;
      await uploadObject(key);
      const entry = await createQueueEntry(prefix, {
        queuedAt: new Date(Date.now() - 60 * 60 * 1_000),
      });
      await assertNoUnownedEligiblePrefixes();
      await assertNoUnownedAssetCleanupCandidates();
      const started = Date.now();
      scheduler.start();
      try {
        let doneAt: Date | null = null;
        while (Date.now() - started < 30_000) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          doneAt =
            (await prisma.storageCleanupQueue.findUnique({ where: { id: entry.id } }))?.doneAt ??
            null;
          if (doneAt) break;
        }
        if (!doneAt || (await storage.head(key))) {
          throw new Error('The scheduled tick did not remove the object within 30 seconds.');
        }
        return `Timer completed the entry after ${Date.now() - started} ms.`;
      } finally {
        scheduler.stop();
      }
    }),
    'delete-route': makeCase('delete-route', async () => {
      const upload = await createApiUpload('delete-route');
      await uploadObject(upload.storageKey);
      const cookie = await ensureAdmin();
      await request(app.getHttpServer())
        .delete(`/api/v1/assets/${upload.assetId}`)
        .set('Origin', requestOrigin)
        .set('Cookie', cookie)
        .expect(204);
      const queueRow = await prisma.storageCleanupQueue.findFirst({
        where: { objectKey: `assets/${upload.assetId}/${upload.fileId}/` },
      });
      if (!queueRow) throw new Error('CUR-14 DELETE did not queue the deleted asset prefix.');
      await prisma.storageCleanupQueue.update({
        where: { id: queueRow.id },
        data: { queuedAt: new Date(Date.now() - 60 * 60 * 1_000) },
      });
      await drainOwnEntries();
      if (
        (await storage.head(upload.storageKey)) ||
        !(
          await prisma.storageCleanupQueue.findUnique({
            where: { id: queueRow.id },
          })
        )?.doneAt
      ) {
        throw new Error('CUR-14 cleanup did not delete its old S3 prefix.');
      }
      return 'CUR-14 DELETE queued and drained the asset prefix.';
    }),
    'replacement-route': makeCase('replacement-route', async () => {
      const original = await createApiUpload('replacement-original');
      await uploadAndComplete(original);
      const cookie = await ensureAdmin();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/assets/${original.assetId}/files`)
        .set('Origin', requestOrigin)
        .set('Cookie', cookie)
        .send({
          filename: 'replacement.png',
          mimeType: 'image/png',
          sizeBytes: PNG_BYTES.length,
        })
        .expect(201);
      const replacementFileId = (response.body as { file: { id: string } }).file.id;
      trackAsset(original.assetId, replacementFileId);
      const newKey = buildOriginalKey(original.assetId, replacementFileId);
      await uploadObject(newKey);
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${original.assetId}/files/${replacementFileId}/complete`)
        .set('Origin', requestOrigin)
        .set('Cookie', cookie)
        .expect(200);
      const oldPrefix = `assets/${original.assetId}/${original.fileId}/`;
      const oldQueue = await prisma.storageCleanupQueue.findFirst({
        where: { objectKey: oldPrefix },
      });
      if (!oldQueue) throw new Error('CUR-13 replacement did not queue the old file prefix.');
      await prisma.storageCleanupQueue.update({
        where: { id: oldQueue.id },
        data: { queuedAt: new Date(Date.now() - 60 * 60 * 1_000) },
      });
      await drainOwnEntries();
      if ((await storage.head(original.storageKey)) || !(await storage.head(newKey))) {
        throw new Error('Replacement cleanup did not preserve only the new file object.');
      }
      return 'CUR-13 replacement removed the old prefix and retained the new file.';
    }),
  };

  async function cleanupCreated(): Promise<{
    queueEntriesDeleted: number;
    fileRowsDeleted: number;
    assetsDeleted: number;
    objectPrefixesDeleted: number;
    objectsDeleted: number;
    usersDeleted: number;
    schoolsDeleted: number;
  }> {
    scheduler.stop();
    const directQueueFilter =
      createdQueueIds.size > 0 || createdPrefixes.size > 0
        ? {
            OR: [
              ...(createdQueueIds.size > 0 ? [{ id: { in: [...createdQueueIds] } }] : []),
              ...[...createdPrefixes].map((prefix) => ({
                objectKey: { startsWith: prefix },
              })),
            ],
          }
        : undefined;
    let queueEntriesDeleted = 0;
    if (directQueueFilter) {
      queueEntriesDeleted = (
        await prisma.storageCleanupQueue.deleteMany({ where: directQueueFilter })
      ).count;
    }
    const fileRowsDeleted =
      createdAssetIds.size === 0
        ? 0
        : (
            await prisma.assetFile.deleteMany({
              where: { assetId: { in: [...createdAssetIds] } },
            })
          ).count;
    if (createdPrefixes.size > 0) {
      const triggerQueueRows = await prisma.storageCleanupQueue.deleteMany({
        where: {
          OR: [...createdPrefixes].map((prefix) => ({
            objectKey: { startsWith: prefix },
          })),
        },
      });
      queueEntriesDeleted += triggerQueueRows.count;
    }
    const assetsDeleted =
      createdAssetIds.size === 0
        ? 0
        : (
            await prisma.asset.deleteMany({
              where: { id: { in: [...createdAssetIds] } },
            })
          ).count;

    let objectsDeleted = 0;
    let objectPrefixesDeleted = 0;
    for (const prefix of createdPrefixes) {
      objectsDeleted += await storage.deleteByPrefix(prefix);
      objectPrefixesDeleted += 1;
    }

    let usersDeleted = 0;
    let schoolsDeleted = 0;
    if (fixture) {
      const userIds = [
        fixture.admin.id,
        fixture.schoolA.teacher.id,
        fixture.schoolA.student.id,
        fixture.schoolB.teacher.id,
        fixture.schoolB.student.id,
      ];
      const schoolIds = [fixture.schoolA.school.id, fixture.schoolB.school.id];
      const classSectionIds = [fixture.schoolA.section.id, fixture.schoolB.section.id];
      usersDeleted = await prisma.user.count({ where: { id: { in: userIds } } });
      schoolsDeleted = await prisma.school.count({ where: { id: { in: schoolIds } } });
      await cleanupFixtures(prisma, userIds, schoolIds, classSectionIds);
      fixture = undefined;
      adminCookie = undefined;
    }

    createdAssetIds.clear();
    createdFileIds.clear();
    createdQueueIds.clear();
    createdPrefixes.clear();
    return {
      queueEntriesDeleted,
      fileRowsDeleted,
      assetsDeleted,
      objectPrefixesDeleted,
      objectsDeleted,
      usersDeleted,
      schoolsDeleted,
    };
  }

  let busy = false;
  async function perform(
    operation: () => Promise<unknown>,
    response: ServerResponse,
  ): Promise<void> {
    if (busy) {
      sendJson(response, 409, { error: 'Another smoke operation is already running.' });
      return;
    }
    busy = true;
    try {
      sendJson(response, 200, await operation());
    } catch (error) {
      sendJson(response, 200, {
        id: 'smoke-operation',
        name: 'Smoke operation',
        passed: false,
        details: safeMessage(error),
        elapsedMs: 0,
      });
    } finally {
      busy = false;
    }
  }

  const server = createServer(async (requestMessage, response) => {
    const url = new URL(requestMessage.url ?? '/', `http://127.0.0.1:${port}`);
    if (requestMessage.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page);
      return;
    }
    if (requestMessage.method === 'POST' && url.pathname === '/run-all') {
      await perform(async () => {
        const results: SmokeResult[] = [];
        for (const { id } of smokeCases) {
          results.push(await cases[id]());
        }
        return results;
      }, response);
      return;
    }
    if (requestMessage.method === 'POST' && url.pathname === '/cleanup') {
      await perform(
        async () => ({
          id: 'cleanup',
          name: 'Clean up what this script created',
          passed: true,
          details: JSON.stringify(await cleanupCreated()),
          elapsedMs: 0,
        }),
        response,
      );
      return;
    }
    const caseId = url.pathname.startsWith('/run/') ? url.pathname.slice('/run/'.length) : '';
    if (requestMessage.method === 'POST' && smokeCases.some(({ id }) => id === caseId)) {
      await perform(cases[caseId as (typeof smokeCases)[number]['id']], response);
      return;
    }
    sendJson(response, 404, { error: 'Not found.' });
  });

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    scheduler.stop();
    process.exitCode = signal === 'SIGINT' ? 130 : 0;
    try {
      const result = await cleanupCreated();
      log(`Removed only script-created records and objects: ${JSON.stringify(result)}`);
    } catch (error) {
      process.exitCode = 1;
      logError(`Cleanup on shutdown failed: ${safeMessage(error)}`);
    } finally {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      await app.close();
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  server.listen(port, '127.0.0.1', () => {
    log(`Cleanup smoke test is available at http://127.0.0.1:${port}`);
    log('Automatic cleanup is disabled. Run the cases, then use the cleanup button.');
  });
  server.on('error', async (error) => {
    logError(`Could not start cleanup smoke server: ${error.message}`);
    await app.close();
    process.exitCode = 1;
  });
}

main().catch((error: unknown) => {
  logError(`Cleanup smoke test could not start: ${safeMessage(error)}`);
  process.exitCode = 1;
});
