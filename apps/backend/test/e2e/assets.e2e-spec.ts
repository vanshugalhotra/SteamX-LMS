import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { Env } from '../../src/config/env.schema.js';
import { AssetFileStatus, AssetType, ContentStatus } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { buildOriginalKey } from '../../src/assets/asset-rules.js';
import { AssetsService } from '../../src/assets/assets.service.js';
import { AssetProcessorRegistry } from '../../src/assets/processing/asset-processor.registry.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp, getTestStorageService } from '../support/create-test-app.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, ...Array(13).fill(0)]);
const PNG_BYTES = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...Array(8).fill(0),
]);
const PDF_BYTES = Buffer.from('%PDF-1.7xxxxxxxx', 'ascii');
const MP4_BYTES = Buffer.from('0000ftypisom0000', 'ascii');

type CreatedAssetResponse = {
  asset: { id: string; type: AssetType; title: string; status: ContentStatus };
  file: {
    id: string;
    assetId: string;
    status: AssetFileStatus;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  };
  upload: {
    url: string;
    method: 'PUT';
    headers: { 'Content-Type': string; 'If-None-Match': string };
    expiresAt: string;
  };
};

describe('Assets endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;
  let schoolStaffCookie: string;
  let limits: Env['assetLimits'];
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Assets e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    limits = config.get('assetLimits', { infer: true });
    if (!origin) {
      throw new Error('Assets e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);
    adminCookie = await loginAsCookie(app, fixture.admin);
    teacherCookie = await loginAsCookie(app, fixture.schoolA.teacher);
    studentCookie = await loginAsCookie(app, fixture.schoolA.student);
    schoolStaffCookie = await loginAsCookie(app, fixture.schoolB.teacher);
  });

  afterAll(async () => {
    if (createdAssetIds.length > 0) {
      await prisma.assetFile.deleteMany({ where: { assetId: { in: createdAssetIds } } });
      await prisma.storageCleanupQueue.deleteMany({
        where: {
          OR: createdAssetIds.map((assetId) => ({
            objectKey: { startsWith: `assets/${assetId}/` },
          })),
        },
      });
      await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    }
    if (fixture) {
      await cleanupFixtures(
        prisma,
        [
          fixture.admin.id,
          fixture.schoolA.teacher.id,
          fixture.schoolA.student.id,
          fixture.schoolB.teacher.id,
          fixture.schoolB.student.id,
        ],
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id],
      );
    }
    await app?.close();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  function postAsset(cookie: string | undefined, body: object) {
    const call = request(app.getHttpServer()).post('/api/v1/assets').set('Origin', origin);
    if (cookie) {
      call.set('Cookie', cookie);
    }
    return call.send(body);
  }

  function getAssetFile(cookie: string, assetId: string, fileId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/files/${fileId}`)
      .set('Cookie', cookie);
  }

  function completeAssetFile(cookie: string | undefined, assetId: string, fileId: string) {
    const call = request(app.getHttpServer())
      .post(`/api/v1/assets/${assetId}/files/${fileId}/complete`)
      .set('Origin', origin);
    if (cookie) {
      call.set('Cookie', cookie);
    }
    return call.send();
  }

  async function createDatabaseAsset(type: AssetType = AssetType.IMAGE): Promise<string> {
    const assetId = randomUUID().toLowerCase();
    await prisma.asset.create({
      data: { id: assetId, type, title: `Database asset ${assetId}` },
    });
    createdAssetIds.push(assetId);
    return assetId;
  }

  async function createDatabaseFile(
    assetId: string,
    status: AssetFileStatus,
    mimeType = 'image/png',
  ) {
    const fileId = randomUUID().toLowerCase();
    const storageKey = buildOriginalKey(assetId, fileId);
    await prisma.assetFile.create({
      data: {
        id: fileId,
        assetId,
        storageKey,
        originalFilename: 'direct-test.png',
        mimeType,
        sizeBytes: 16n,
      },
    });

    if (status === AssetFileStatus.UPLOADING) {
      return { id: fileId, storageKey };
    }

    const uploaded = await prisma.assetFile.update({
      where: { id: fileId },
      data: { status: AssetFileStatus.UPLOADED },
    });
    if (status === AssetFileStatus.UPLOADED) {
      return { id: uploaded.id, storageKey };
    }

    const nextStatus =
      status === AssetFileStatus.FAILED ? AssetFileStatus.FAILED : AssetFileStatus.PROCESSING;
    const progressed = await prisma.assetFile.update({
      where: { id: fileId },
      data: { status: nextStatus },
    });
    if (status === AssetFileStatus.READY) {
      const ready = await prisma.assetFile.update({
        where: { id: progressed.id },
        data: { status: AssetFileStatus.READY },
      });
      return { id: ready.id, storageKey };
    }
    return { id: progressed.id, storageKey };
  }

  async function createAndUpload(
    type: AssetType,
    mimeType: string,
    bytes: Buffer,
    options: { sizeBytes?: number; contentType?: string } = {},
  ): Promise<CreatedAssetResponse> {
    const response = await postAsset(adminCookie, {
      ...standardBody(type, mimeType),
      sizeBytes: bytes.length,
    }).expect(201);
    const created = trackCreated(response);
    getTestStorageService(app).simulateUpload(created.upload.url.replace('memory://upload/', ''), {
      bytes,
      sizeBytes: options.sizeBytes,
      contentType: options.contentType ?? mimeType,
    });
    return created;
  }

  function standardBody(type: string, mimeType: string) {
    return {
      type,
      title: 'Asset title',
      filename: 'original.jpg',
      mimeType,
      sizeBytes: 12,
    };
  }

  function trackCreated(response: { body: CreatedAssetResponse }): CreatedAssetResponse {
    createdAssetIds.push(response.body.asset.id);
    return response.body;
  }

  it.each([
    [AssetType.IMAGE, 'IMAGE.PNG', ' IMAGE/PNG '],
    [AssetType.PDF, 'notes.pdf', 'APPLICATION/PDF'],
    [AssetType.VIDEO, 'lesson.mp4', 'VIDEO/MP4'],
  ] as const)(
    'creates an UPLOADING %s asset and returns upload instructions',
    async (type, filename, mimeType) => {
      const response = await postAsset(adminCookie, {
        ...standardBody(type, mimeType),
        filename,
      }).expect(201);
      const created = trackCreated(response);
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: created.asset.id } });
      const file = await prisma.assetFile.findUniqueOrThrow({ where: { id: created.file.id } });

      expect(created.asset).toMatchObject({
        id: asset.id,
        type,
        title: 'Asset title',
        status: ContentStatus.ACTIVE,
      });
      expect(created.file).toMatchObject({
        id: file.id,
        assetId: asset.id,
        status: AssetFileStatus.UPLOADING,
        mimeType: mimeType.trim().toLowerCase(),
        sizeBytes: 12,
      });
      expect(typeof created.file.sizeBytes).toBe('number');
      expect(file.mimeType).toBe(mimeType.trim().toLowerCase());
      expect(file.sizeBytes).toBe(12n);
      expect(file.originalFilename).toBe(filename);
      expect(file.storageKey).toBe(`assets/${asset.id}/${file.id}/original`);
      expect(Object.keys(created).sort()).toEqual(['asset', 'file', 'upload']);
      expect(Object.keys(created.asset).sort()).toEqual(
        ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt'].sort(),
      );
      expect(Object.keys(created.file).sort()).toEqual(
        [
          'id',
          'assetId',
          'status',
          'originalFilename',
          'mimeType',
          'sizeBytes',
          'lastError',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
      expect(Object.keys(created.upload).sort()).toEqual(
        ['url', 'method', 'headers', 'expiresAt'].sort(),
      );
      expect(created.upload).toMatchObject({
        url: `memory://upload/${file.storageKey}`,
        method: 'PUT',
        headers: { 'Content-Type': mimeType.trim().toLowerCase(), 'If-None-Match': '*' },
      });
      expect(Number.isNaN(Date.parse(created.upload.expiresAt))).toBe(false);
    },
  );

  it('trims title, removes filename control characters, and normalizes MIME', async () => {
    const response = await postAsset(adminCookie, {
      ...standardBody(AssetType.IMAGE, ' IMAGE/PNG '),
      title: '  Clean title  ',
      filename: '  first\u0000\nsecond.png  ',
    }).expect(201);
    const created = trackCreated(response);
    const file = await prisma.assetFile.findUniqueOrThrow({ where: { id: created.file.id } });

    expect(created.asset.title).toBe('Clean title');
    expect(file.originalFilename).toBe('firstsecond.png');
    expect(file.mimeType).toBe('image/png');
  });

  it('rejects unsupported types and disallowed MIME types with stable codes', async () => {
    const pptx = await postAsset(adminCookie, {
      ...standardBody(AssetType.PPTX, 'application/pdf'),
    }).expect(400);
    expect(pptx.body.code).toBe('ASSET_TYPE_NOT_SUPPORTED');

    for (const mimeType of ['', 'application/pdf', 'image/png; charset=utf-8']) {
      const response = await postAsset(adminCookie, {
        ...standardBody(AssetType.IMAGE, mimeType),
      }).expect(400);
      expect(response.body.code).toBe('MIME_NOT_ALLOWED');
    }

    await postAsset(adminCookie, {
      ...standardBody('OTHER', 'image/png'),
    })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('ASSET_TYPE_NOT_SUPPORTED'));
  });

  it.each([
    [AssetType.IMAGE, 'image/jpeg', 'image'],
    [AssetType.PDF, 'application/pdf', 'pdf'],
    [AssetType.VIDEO, 'video/mp4', 'video'],
  ] as const)('rejects %s uploads above the type limit', async (type, mimeType, limitKey) => {
    const response = await postAsset(adminCookie, {
      ...standardBody(type, mimeType),
      sizeBytes: limits[limitKey] + 1,
    }).expect(400);
    expect(response.body.code).toBe('FILE_TOO_LARGE');
  });

  it.each([0, -1, 1.5])('rejects invalid sizeBytes %s', async (sizeBytes) => {
    await postAsset(adminCookie, {
      ...standardBody(AssetType.IMAGE, 'image/jpeg'),
      sizeBytes,
    }).expect(400);
  });

  it('rejects blank metadata and unknown fields', async () => {
    const base = standardBody(AssetType.IMAGE, 'image/jpeg');
    for (const title of ['', '   ']) {
      await postAsset(adminCookie, { ...base, title }).expect(400);
    }
    for (const filename of ['', '   ']) {
      await postAsset(adminCookie, { ...base, filename }).expect(400);
    }
    await postAsset(adminCookie, { ...base, unexpected: true }).expect(400);
  });

  it('requires authentication and denies teacher and student roles', async () => {
    await postAsset(undefined, standardBody(AssetType.IMAGE, 'image/jpeg')).expect(401);
    await postAsset(teacherCookie, standardBody(AssetType.IMAGE, 'image/jpeg')).expect(403);
    await postAsset(studentCookie, standardBody(AssetType.IMAGE, 'image/jpeg')).expect(403);
    await postAsset(schoolStaffCookie, standardBody(AssetType.IMAGE, 'image/jpeg')).expect(403);
  });

  it('returns file state and rejects foreign, unknown, and invalid IDs', async () => {
    const first = trackCreated(
      await postAsset(adminCookie, standardBody(AssetType.IMAGE, 'image/jpeg')).expect(201),
    );
    const second = trackCreated(
      await postAsset(adminCookie, standardBody(AssetType.PDF, 'application/pdf')).expect(201),
    );

    const response = await getAssetFile(adminCookie, first.asset.id, first.file.id).expect(200);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'id',
        'assetId',
        'status',
        'originalFilename',
        'mimeType',
        'sizeBytes',
        'lastError',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(response.body).toMatchObject({
      id: first.file.id,
      assetId: first.asset.id,
      status: AssetFileStatus.UPLOADING,
      originalFilename: 'original.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      lastError: null,
    });
    expect(typeof response.body.sizeBytes).toBe('number');

    await getAssetFile(adminCookie, second.asset.id, first.file.id).expect(404);
    await getAssetFile(adminCookie, '550e8400-e29b-41d4-a716-446655440099', first.file.id).expect(
      404,
    );
    await getAssetFile(adminCookie, first.asset.id, '550e8400-e29b-41d4-a716-446655440099').expect(
      404,
    );
    await getAssetFile(adminCookie, 'invalid-id', first.file.id).expect(404);
    await getAssetFile(adminCookie, first.asset.id, 'invalid-id').expect(404);
    await getAssetFile(teacherCookie, first.asset.id, first.file.id).expect(403);
    await getAssetFile(studentCookie, first.asset.id, first.file.id).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/assets/${first.asset.id}/files/${first.file.id}`)
      .expect(401);
  });

  it.each([
    [AssetType.IMAGE, 'image/jpeg', JPEG_BYTES, null],
    [AssetType.PDF, 'application/pdf', PDF_BYTES, null],
    [AssetType.VIDEO, 'video/mp4', MP4_BYTES, true],
  ] as const)(
    'completes a valid %s upload and is idempotent',
    async (type, mimeType, bytes, video) => {
      const created = await createAndUpload(type, mimeType, bytes, {
        contentType: `${mimeType}; charset=binary`,
      });

      const completed = await completeAssetFile(
        adminCookie,
        created.asset.id,
        created.file.id,
      ).expect(200);
      expect(completed.body).toMatchObject({
        id: created.file.id,
        assetId: created.asset.id,
        status: AssetFileStatus.READY,
        sizeBytes: bytes.length,
        mimeType,
        lastError: null,
      });
      expect(completed.body.playbackKey).toBeUndefined();

      const databaseFile = await prisma.assetFile.findUniqueOrThrow({
        where: { id: created.file.id },
      });
      expect(databaseFile.status).toBe(AssetFileStatus.READY);
      expect(databaseFile.sizeBytes).toBe(BigInt(bytes.length));
      expect(databaseFile.mimeType).toBe(mimeType);
      expect(databaseFile.playbackKey).toBe(video ? databaseFile.storageKey : null);

      const repeated = await completeAssetFile(
        adminCookie,
        created.asset.id,
        created.file.id,
      ).expect(200);
      expect(repeated.body).toEqual(completed.body);
      expect(await prisma.assetFile.findUniqueOrThrow({ where: { id: created.file.id } })).toEqual(
        databaseFile,
      );
    },
  );

  it('returns retryable UPLOAD_NOT_COMPLETE before upload, then completes after upload', async () => {
    const response = await postAsset(adminCookie, {
      ...standardBody(AssetType.IMAGE, 'image/png'),
      sizeBytes: PNG_BYTES.length,
    }).expect(201);
    const created = trackCreated(response);

    const early = await completeAssetFile(adminCookie, created.asset.id, created.file.id).expect(
      409,
    );
    expect(early.body.code).toBe('UPLOAD_NOT_COMPLETE');
    await expect(
      prisma.assetFile.findUniqueOrThrow({ where: { id: created.file.id } }),
    ).resolves.toMatchObject({ status: AssetFileStatus.UPLOADING });

    getTestStorageService(app).simulateUpload(
      `assets/${created.asset.id}/${created.file.id}/original`,
      { bytes: PNG_BYTES, contentType: 'image/png' },
    );
    const retried = await completeAssetFile(adminCookie, created.asset.id, created.file.id).expect(
      200,
    );
    expect(retried.body.status).toBe(AssetFileStatus.READY);
  });

  it('marks a size mismatch FAILED and returns the same FAILED state on retry', async () => {
    const created = await createAndUpload(AssetType.IMAGE, 'image/png', PNG_BYTES, {
      sizeBytes: PNG_BYTES.length + 1,
    });
    const failed = await completeAssetFile(adminCookie, created.asset.id, created.file.id).expect(
      200,
    );
    expect(failed.body).toMatchObject({
      status: AssetFileStatus.FAILED,
      lastError: 'SIZE_MISMATCH',
    });

    const repeated = await completeAssetFile(adminCookie, created.asset.id, created.file.id).expect(
      200,
    );
    expect(repeated.body).toEqual(failed.body);
  });

  it('marks a content-type mismatch FAILED before checking file bytes', async () => {
    const created = await createAndUpload(AssetType.IMAGE, 'image/png', PNG_BYTES, {
      contentType: 'image/jpeg',
    });
    const response = await completeAssetFile(adminCookie, created.asset.id, created.file.id).expect(
      200,
    );

    expect(response.body).toMatchObject({
      status: AssetFileStatus.FAILED,
      lastError: 'TYPE_MISMATCH',
    });
  });

  it.each([
    [AssetType.IMAGE, 'image/jpeg', PNG_BYTES],
    [AssetType.PDF, 'application/pdf', Buffer.from('this is plain text data', 'ascii')],
    [AssetType.VIDEO, 'video/mp4', Buffer.from('0000ftypheic0000', 'ascii')],
    [AssetType.VIDEO, 'video/mp4', Buffer.from('0000ftypqt  0000', 'ascii')],
  ] as const)(
    'rejects unrecognized bytes for %s with a safe error code',
    async (type, mime, bytes) => {
      const created = await createAndUpload(type, mime, bytes);
      const response = await completeAssetFile(
        adminCookie,
        created.asset.id,
        created.file.id,
      ).expect(200);

      expect(response.body).toMatchObject({
        status: AssetFileStatus.FAILED,
        lastError: 'CONTENT_NOT_RECOGNIZED',
      });
      expect(JSON.stringify(response.body)).not.toContain('AWS');
    },
  );

  it('marks processor failures FAILED without returning or storing internal error text', async () => {
    const created = await createAndUpload(AssetType.IMAGE, 'image/jpeg', JPEG_BYTES);
    const processor = app.get(AssetProcessorRegistry).get(AssetType.IMAGE);
    const process = vi
      .spyOn(processor, 'process')
      .mockRejectedValueOnce(new Error('AWS internal stack and credentials'));
    const response = await completeAssetFile(adminCookie, created.asset.id, created.file.id).expect(
      200,
    );
    process.mockRestore();

    expect(response.body).toMatchObject({
      status: AssetFileStatus.FAILED,
      lastError: 'PROCESSING_FAILED',
    });
    expect(JSON.stringify(response.body)).not.toContain('AWS internal');
    expect(
      await prisma.assetFile.findUniqueOrThrow({ where: { id: created.file.id } }),
    ).toMatchObject({ status: AssetFileStatus.FAILED, lastError: 'PROCESSING_FAILED' });
  });

  it('handles concurrent completion requests with one processing winner', async () => {
    const created = await createAndUpload(AssetType.IMAGE, 'image/jpeg', JPEG_BYTES);
    const processor = app.get(AssetProcessorRegistry).get(AssetType.IMAGE);
    const process = vi.spyOn(processor, 'process');
    const [first, second] = await Promise.all([
      completeAssetFile(adminCookie, created.asset.id, created.file.id),
      completeAssetFile(adminCookie, created.asset.id, created.file.id),
    ]);
    const processCallCount = process.mock.calls.length;
    process.mockRestore();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(processCallCount).toBe(1);
    await expect(
      prisma.assetFile.findUniqueOrThrow({ where: { id: created.file.id } }),
    ).resolves.toMatchObject({ status: AssetFileStatus.READY });
  });

  it('returns 404 for foreign, unknown, and malformed completion IDs and enforces permissions', async () => {
    const first = await createAndUpload(AssetType.IMAGE, 'image/jpeg', JPEG_BYTES);
    const second = await createAndUpload(AssetType.PDF, 'application/pdf', PDF_BYTES);

    await completeAssetFile(adminCookie, second.asset.id, first.file.id).expect(404);
    await completeAssetFile(
      adminCookie,
      '550e8400-e29b-41d4-a716-446655440099',
      first.file.id,
    ).expect(404);
    await completeAssetFile(
      adminCookie,
      first.asset.id,
      '550e8400-e29b-41d4-a716-446655440099',
    ).expect(404);
    await completeAssetFile(adminCookie, 'invalid-id', first.file.id).expect(404);
    await completeAssetFile(adminCookie, first.asset.id, 'invalid-id').expect(404);
    await completeAssetFile(undefined, first.asset.id, first.file.id).expect(401);
    await completeAssetFile(teacherCookie, first.asset.id, first.file.id).expect(403);
    await completeAssetFile(studentCookie, first.asset.id, first.file.id).expect(403);
    await completeAssetFile(schoolStaffCookie, first.asset.id, first.file.id).expect(403);
  });

  it('replaces a READY file atomically and queues exactly its old prefix for cleanup', async () => {
    const assetId = await createDatabaseAsset();
    const oldFile = await createDatabaseFile(assetId, AssetFileStatus.READY);
    const pendingFile = await createDatabaseFile(assetId, AssetFileStatus.PROCESSING);

    const ready = await app.get(AssetsService).makeReady(pendingFile.id, {
      sizeBytes: 20,
      mimeType: 'image/png',
      playbackKey: null,
    });
    expect(ready).toMatchObject({
      id: pendingFile.id,
      status: AssetFileStatus.READY,
      sizeBytes: 20n,
      mimeType: 'image/png',
    });
    await expect(prisma.assetFile.findUnique({ where: { id: oldFile.id } })).resolves.toBeNull();
    await expect(
      prisma.assetFile.findMany({
        where: { assetId, status: AssetFileStatus.READY },
      }),
    ).resolves.toMatchObject([{ id: pendingFile.id }]);
    const cleanupEntries = await prisma.$queryRaw<
      Array<{ object_key: string; is_prefix: boolean }>
    >`
      SELECT "object_key", "is_prefix"
      FROM "storage_cleanup_queue"
      WHERE "object_key" = ${`assets/${assetId}/${oldFile.id}/`}
    `;
    expect(cleanupEntries).toEqual([
      { object_key: `assets/${assetId}/${oldFile.id}/`, is_prefix: true },
    ]);
  });

  it.each(['FAILED', 'DELETED'] as const)(
    'rolls back the old-file deletion when the replacement is %s',
    async (replacementState) => {
      const assetId = await createDatabaseAsset();
      const oldFile = await createDatabaseFile(assetId, AssetFileStatus.READY);
      const replacement = await createDatabaseFile(assetId, AssetFileStatus.PROCESSING);
      if (replacementState === 'FAILED') {
        await prisma.assetFile.update({
          where: { id: replacement.id },
          data: { status: AssetFileStatus.FAILED },
        });
      } else {
        await prisma.assetFile.delete({ where: { id: replacement.id } });
      }

      await expect(
        app.get(AssetsService).makeReady(replacement.id, {
          sizeBytes: 20,
          mimeType: 'image/png',
          playbackKey: null,
        }),
      ).rejects.toThrow();
      await expect(
        prisma.assetFile.findUnique({ where: { id: oldFile.id } }),
      ).resolves.toMatchObject({ status: AssetFileStatus.READY });
      await expect(
        prisma.storageCleanupQueue.findMany({
          where: { objectKey: `assets/${assetId}/${oldFile.id}/` },
        }),
      ).resolves.toEqual([]);
    },
  );

  it('serializes concurrent makeReady calls for different files of one asset', async () => {
    const assetId = await createDatabaseAsset();
    await createDatabaseFile(assetId, AssetFileStatus.READY);
    const first = await createDatabaseFile(assetId, AssetFileStatus.PROCESSING);
    const second = await createDatabaseFile(assetId, AssetFileStatus.PROCESSING);

    const results = await Promise.all([
      app.get(AssetsService).makeReady(first.id, {
        sizeBytes: 16,
        mimeType: 'image/png',
        playbackKey: null,
      }),
      app.get(AssetsService).makeReady(second.id, {
        sizeBytes: 16,
        mimeType: 'image/png',
        playbackKey: null,
      }),
    ]);
    expect(results.map(({ status }) => status)).toEqual([
      AssetFileStatus.READY,
      AssetFileStatus.READY,
    ]);
    await expect(
      prisma.assetFile.findMany({
        where: { assetId, status: AssetFileStatus.READY },
      }),
    ).resolves.toHaveLength(1);
  });
});
