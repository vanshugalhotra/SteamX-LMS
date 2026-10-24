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
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
} from '../../src/generated/prisma/client.js';
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
  let accessTtls: Env['assetAccess'];
  const createdAssetIds: string[] = [];
  const createdCourseIds: string[] = [];
  const createdModuleIds: string[] = [];
  const createdLessonIds: string[] = [];

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
    accessTtls = config.get('assetAccess', { infer: true });
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
    if (createdLessonIds.length > 0) {
      await prisma.lessonBlock.deleteMany({ where: { lessonId: { in: createdLessonIds } } });
      await prisma.lesson.deleteMany({ where: { id: { in: createdLessonIds } } });
    }
    if (createdModuleIds.length > 0) {
      await prisma.module.deleteMany({ where: { id: { in: createdModuleIds } } });
    }
    if (createdCourseIds.length > 0) {
      await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
    }
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

  function getAssets(cookie: string | undefined, query: Record<string, string | number> = {}) {
    const call = request(app.getHttpServer()).get('/api/v1/assets').query(query);
    if (cookie) {
      call.set('Cookie', cookie);
    }
    return call;
  }

  function getAsset(cookie: string | undefined, assetId: string) {
    const call = request(app.getHttpServer()).get(`/api/v1/assets/${assetId}`);
    if (cookie) {
      call.set('Cookie', cookie);
    }
    return call;
  }

  function getAssetAccess(cookie: string | undefined, assetId: string) {
    const call = request(app.getHttpServer()).get(`/api/v1/assets/${assetId}/access`);
    if (cookie) {
      call.set('Cookie', cookie);
    }
    return call;
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

  async function createDatabaseAsset(
    type: AssetType = AssetType.IMAGE,
    options: { title?: string; status?: ContentStatus; createdAt?: Date } = {},
  ): Promise<string> {
    const assetId = randomUUID().toLowerCase();
    await prisma.asset.create({
      data: {
        id: assetId,
        type,
        title: options.title ?? `Database asset ${assetId}`,
        status: options.status,
        createdAt: options.createdAt,
      },
    });
    createdAssetIds.push(assetId);
    return assetId;
  }

  async function createDatabaseFile(
    assetId: string,
    status: AssetFileStatus,
    mimeType = 'image/png',
    options: {
      createdAt?: Date;
      lastError?: string;
      originalFilename?: string;
      fileId?: string;
      playbackKey?: string | null;
    } = {},
  ) {
    const fileId = options.fileId ?? randomUUID().toLowerCase();
    const storageKey = buildOriginalKey(assetId, fileId);
    await prisma.assetFile.create({
      data: {
        id: fileId,
        assetId,
        storageKey,
        originalFilename: options.originalFilename ?? 'direct-test.png',
        mimeType,
        sizeBytes: 16n,
        createdAt: options.createdAt,
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
      data: { status: nextStatus, lastError: options.lastError },
    });
    if (status === AssetFileStatus.READY) {
      const playbackKey =
        options.playbackKey ?? (mimeType === 'video/mp4' ? storageKey : undefined);
      const ready = await prisma.assetFile.update({
        where: { id: progressed.id },
        data: {
          status: AssetFileStatus.READY,
          ...(playbackKey !== undefined && { playbackKey }),
        },
      });
      return { id: ready.id, storageKey };
    }
    return { id: progressed.id, storageKey };
  }

  async function createDatabaseCourse(title: string) {
    const course = await prisma.course.create({ data: { title } });
    createdCourseIds.push(course.id);
    return course;
  }

  async function createDatabaseModule(courseId: string, title: string, position = 1) {
    const module = await prisma.module.create({
      data: { courseId, title, position },
    });
    createdModuleIds.push(module.id);
    return module;
  }

  async function createDatabaseLesson(
    courseId: string,
    moduleId: string,
    title: string,
    position = 1,
    status: ContentStatus = ContentStatus.DRAFT,
  ) {
    const lesson = await prisma.lesson.create({
      data: { courseId, moduleId, title, position, status },
    });
    createdLessonIds.push(lesson.id);
    return lesson;
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
      sizeBytes: 16,
    };
  }

  function trackCreated(response: { body: CreatedAssetResponse }): CreatedAssetResponse {
    createdAssetIds.push(response.body.asset.id);
    return response.body;
  }

  it.each([
    [AssetType.IMAGE, 'image/png', 'image.png', 'imageTtlSeconds'],
    [AssetType.PDF, 'application/pdf', 'notes.pdf', 'pdfTtlSeconds'],
    [AssetType.VIDEO, 'video/mp4', 'lesson.mp4', 'videoTtlSeconds'],
  ] as const)(
    'issues a no-store access URL for a READY %s asset',
    async (type, mimeType, filename, ttlKey) => {
      const assetId = await createDatabaseAsset(type);
      await createDatabaseFile(assetId, AssetFileStatus.READY, mimeType, {
        originalFilename: filename,
      });
      const before = Date.now();

      const response = await getAssetAccess(adminCookie, assetId).expect(200);
      const expiresAt = Date.parse(response.body.expiresAt);
      const ttlSeconds = accessTtls[ttlKey];

      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body).sort()).toEqual(
        ['url', 'expiresAt', 'type', 'mimeType'].sort(),
      );
      expect(response.body).toMatchObject({
        url: expect.stringMatching(/^memory:\/\/download\/assets\//),
        type,
        mimeType,
      });
      expect(Number.isNaN(expiresAt)).toBe(false);
      expect(expiresAt).toBeGreaterThanOrEqual(before + ttlSeconds * 1_000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttlSeconds * 1_000);
    },
  );

  it('signs a video playbackKey when it differs from storageKey', async () => {
    const assetId = await createDatabaseAsset(AssetType.VIDEO);
    const fileId = randomUUID().toLowerCase();
    const playbackKey = `assets/${assetId}/${fileId}/hls/index.m3u8`;
    const file = await createDatabaseFile(assetId, AssetFileStatus.READY, 'video/mp4', {
      fileId,
      playbackKey,
    });
    const storage = getTestStorageService(app);
    const requestCount = storage.downloadRequests.length;

    await getAssetAccess(adminCookie, assetId).expect(200);

    expect(storage.downloadRequests).toHaveLength(requestCount + 1);
    expect(storage.downloadRequests.at(-1)?.key).toBe(playbackKey);
    expect(storage.downloadRequests.at(-1)?.key).not.toBe(file.storageKey);
  });

  it('returns ASSET_NOT_READY when the asset has no files', async () => {
    const assetId = await createDatabaseAsset();
    const response = await getAssetAccess(adminCookie, assetId).expect(409);
    expect(response.body.code).toBe('ASSET_NOT_READY');
  });

  it.each([
    AssetFileStatus.FAILED,
    AssetFileStatus.UPLOADING,
    AssetFileStatus.UPLOADED,
    AssetFileStatus.PROCESSING,
  ])('returns ASSET_NOT_READY when the only file is %s', async (status) => {
    const assetId = await createDatabaseAsset();
    await createDatabaseFile(assetId, status);
    const response = await getAssetAccess(adminCookie, assetId).expect(409);
    expect(response.body.code).toBe('ASSET_NOT_READY');
  });

  it('serves the READY file while a newer replacement is UPLOADING', async () => {
    const assetId = await createDatabaseAsset();
    const readyFile = await createDatabaseFile(assetId, AssetFileStatus.READY);
    await createDatabaseFile(assetId, AssetFileStatus.UPLOADING, 'image/png', {
      createdAt: new Date(Date.now() + 1_000),
    });
    const storage = getTestStorageService(app);
    const requestCount = storage.downloadRequests.length;

    await getAssetAccess(adminCookie, assetId).expect(200);

    expect(storage.downloadRequests).toHaveLength(requestCount + 1);
    expect(storage.downloadRequests.at(-1)?.key).toBe(readyFile.storageKey);
  });

  it('allows access to READY files on archived assets', async () => {
    const assetId = await createDatabaseAsset(AssetType.IMAGE, {
      status: ContentStatus.ARCHIVED,
    });
    await createDatabaseFile(assetId, AssetFileStatus.READY);

    await getAssetAccess(adminCookie, assetId).expect(200);
  });

  it('returns 404 for unknown and malformed asset IDs', async () => {
    await getAssetAccess(adminCookie, randomUUID()).expect(404);
    await getAssetAccess(adminCookie, 'not-a-uuid').expect(404);
  });

  it('requires authentication and asset.read permission for access URLs', async () => {
    const assetId = await createDatabaseAsset();
    await createDatabaseFile(assetId, AssetFileStatus.READY);

    await getAssetAccess(undefined, assetId).expect(401);
    await getAssetAccess(teacherCookie, assetId).expect(403);
    await getAssetAccess(studentCookie, assetId).expect(403);
    await getAssetAccess(schoolStaffCookie, assetId).expect(403);
  });

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
        sizeBytes: 16,
      });
      expect(typeof created.file.sizeBytes).toBe('number');
      expect(file.mimeType).toBe(mimeType.trim().toLowerCase());
      expect(file.sizeBytes).toBe(16n);
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

  it.each([1, 15])(
    'rejects uploads too small for signature checks: %s bytes',
    async (sizeBytes) => {
      const response = await postAsset(adminCookie, {
        ...standardBody(AssetType.IMAGE, 'image/png'),
        sizeBytes,
      }).expect(400);
      expect(response.body.code).toBe('FILE_TOO_SMALL');
    },
  );

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

  it('lists only assets with READY files and applies status, type, and literal search filters', async () => {
    const marker = `library-${randomUUID()}`;
    const readyImageId = await createDatabaseAsset(AssetType.IMAGE, {
      title: `${marker} 100%_match`,
    });
    await createDatabaseFile(readyImageId, AssetFileStatus.READY);
    await createDatabaseFile(readyImageId, AssetFileStatus.UPLOADING);

    const readyPdfId = await createDatabaseAsset(AssetType.PDF, { title: `${marker} PDF` });
    await createDatabaseFile(readyPdfId, AssetFileStatus.READY, 'application/pdf');

    const hiddenStatuses = [
      AssetFileStatus.FAILED,
      AssetFileStatus.UPLOADING,
      AssetFileStatus.UPLOADED,
    ];
    const hiddenAssetIds: string[] = [];
    for (const status of hiddenStatuses) {
      const hiddenId = await createDatabaseAsset(AssetType.IMAGE, {
        title: `${marker} hidden ${status}`,
      });
      hiddenAssetIds.push(hiddenId);
      await createDatabaseFile(hiddenId, status);
    }
    const hiddenWithoutFile = await createDatabaseAsset(AssetType.IMAGE, {
      title: `${marker} no file`,
    });

    const archivedId = await createDatabaseAsset(AssetType.IMAGE, {
      title: `${marker} archived`,
      status: ContentStatus.ARCHIVED,
    });
    await createDatabaseFile(archivedId, AssetFileStatus.READY);
    const decoyId = await createDatabaseAsset(AssetType.IMAGE, {
      title: `${marker} 100XXmatch`,
    });
    await createDatabaseFile(decoyId, AssetFileStatus.READY);
    const percentDecoyId = await createDatabaseAsset(AssetType.IMAGE, {
      title: `${marker} 100%Xmatch`,
    });
    await createDatabaseFile(percentDecoyId, AssetFileStatus.READY);
    const underscoreDecoyId = await createDatabaseAsset(AssetType.IMAGE, {
      title: `${marker} 100X_match`,
    });
    await createDatabaseFile(underscoreDecoyId, AssetFileStatus.READY);

    const defaultList = await getAssets(adminCookie, { search: marker }).expect(200);
    expect(defaultList.body.items.map((item: { id: string }) => item.id)).toContain(readyImageId);
    expect(defaultList.body.items.map((item: { id: string }) => item.id)).toContain(readyPdfId);
    expect(defaultList.body.items.map((item: { id: string }) => item.id)).not.toContain(archivedId);
    for (const hiddenId of [...hiddenAssetIds, hiddenWithoutFile]) {
      expect(defaultList.body.items.map((item: { id: string }) => item.id)).not.toContain(hiddenId);
    }
    for (const item of defaultList.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt', 'file'].sort(),
      );
      expect(Object.keys(item.file).sort()).toEqual(
        ['mimeType', 'sizeBytes', 'originalFilename'].sort(),
      );
    }
    const readyItem = defaultList.body.items.find(
      (item: { id: string }) => item.id === readyImageId,
    );
    expect(readyItem.file).toEqual({
      mimeType: 'image/png',
      sizeBytes: 16,
      originalFilename: 'direct-test.png',
    });
    expect(defaultList.body.page).toBe(1);
    expect(defaultList.body.limit).toBe(20);

    const literalSearch = await getAssets(adminCookie, {
      search: `${marker} 100%_`,
    }).expect(200);
    expect(literalSearch.body.items.map((item: { id: string }) => item.id)).toEqual([readyImageId]);
    const percentSearch = await getAssets(adminCookie, { search: `${marker} 100%` }).expect(200);
    expect(percentSearch.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [readyImageId, percentDecoyId].sort(),
    );
    const underscoreSearch = await getAssets(adminCookie, { search: '_match' }).expect(200);
    expect(underscoreSearch.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [readyImageId, underscoreDecoyId].sort(),
    );

    const typeFilter = await getAssets(adminCookie, {
      search: marker,
      type: AssetType.PDF,
    }).expect(200);
    expect(typeFilter.body.items.map((item: { id: string }) => item.id)).toEqual([readyPdfId]);

    const archivedList = await getAssets(adminCookie, {
      search: marker,
      status: ContentStatus.ARCHIVED,
    }).expect(200);
    expect(archivedList.body.items.map((item: { id: string }) => item.id)).toEqual([archivedId]);
    const combinedFilters = await getAssets(adminCookie, {
      search: marker,
      status: ContentStatus.ARCHIVED,
      type: AssetType.IMAGE,
    }).expect(200);
    expect(combinedFilters.body.total).toBe(1);
    expect(combinedFilters.body.items.map((item: { id: string }) => item.id)).toEqual([archivedId]);
    const trimmedSearch = await getAssets(adminCookie, { search: `  ${marker} PDF  ` }).expect(200);
    expect(trimmedSearch.body.items.map((item: { id: string }) => item.id)).toEqual([readyPdfId]);

    const caseInsensitiveSearch = await getAssets(adminCookie, {
      search: `${marker.toUpperCase()} PDF`,
    }).expect(200);
    expect(caseInsensitiveSearch.body.items.map((item: { id: string }) => item.id)).toEqual([
      readyPdfId,
    ]);
  });

  it('validates list filters and paginates with stable createdAt/id ordering', async () => {
    const marker = `page-${randomUUID()}`;
    const timestamp = new Date('2026-01-01T00:00:00.000Z');
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const assetId = await createDatabaseAsset(AssetType.IMAGE, {
        title: `${marker} ${index}`,
        createdAt: timestamp,
      });
      ids.push(assetId);
      await createDatabaseFile(assetId, AssetFileStatus.READY);
    }

    const firstPage = await getAssets(adminCookie, { search: marker, limit: 2 }).expect(200);
    expect(firstPage.body.page).toBe(1);
    expect(firstPage.body.limit).toBe(2);
    expect(firstPage.body.total).toBe(4);
    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual(
      [...ids].sort().reverse().slice(0, 2),
    );
    const secondPage = await getAssets(adminCookie, { search: marker, page: 2, limit: 2 }).expect(
      200,
    );
    expect(secondPage.body.items.map((item: { id: string }) => item.id)).toEqual(
      [...ids].sort().reverse().slice(2),
    );
    const pastLastPage = await getAssets(adminCookie, {
      search: marker,
      page: 3,
      limit: 2,
    }).expect(200);
    expect(pastLastPage.body).toMatchObject({ items: [], total: 4, page: 3, limit: 2 });
    await getAssets(adminCookie, { search: marker, limit: 100 }).expect(200);

    await getAssets(adminCookie, { search: marker, status: ContentStatus.DRAFT }).expect(400);
    await getAssets(adminCookie, { search: marker, status: 'junk' }).expect(400);
    await getAssets(adminCookie, { search: marker, type: 'junk' }).expect(400);
    await getAssets(adminCookie, { search: marker, searchExtra: 'unknown' }).expect(400);
    await getAssets(adminCookie, { search: 'x'.repeat(101) }).expect(400);
    await getAssets(adminCookie, { limit: 101 }).expect(400);

    const dateMarker = `date-order-${randomUUID()}`;
    const olderAssetId = await createDatabaseAsset(AssetType.IMAGE, {
      title: dateMarker,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const newerAssetId = await createDatabaseAsset(AssetType.IMAGE, {
      title: dateMarker,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await createDatabaseFile(olderAssetId, AssetFileStatus.READY);
    await createDatabaseFile(newerAssetId, AssetFileStatus.READY);
    const dateOrdered = await getAssets(adminCookie, { search: dateMarker }).expect(200);
    expect(dateOrdered.body.items.map((item: { id: string }) => item.id)).toEqual([
      newerAssetId,
      olderAssetId,
    ]);
  });

  it('requires asset.read for library list and detail routes', async () => {
    await getAssets(undefined).expect(401);
    await getAssets(teacherCookie).expect(403);
    await getAssets(studentCookie).expect(403);
    await getAssets(schoolStaffCookie).expect(403);

    await getAsset(undefined, randomUUID()).expect(401);
    await getAsset(teacherCookie, randomUUID()).expect(403);
    await getAsset(studentCookie, randomUUID()).expect(403);
    await getAsset(schoolStaffCookie, randomUUID()).expect(403);
  });

  it('returns the current file state for READY, failed, replacement, empty, and archived assets', async () => {
    const readyAssetId = await createDatabaseAsset();
    const readyFile = await createDatabaseFile(readyAssetId, AssetFileStatus.READY);
    const failedAssetId = await createDatabaseAsset();
    const failedFile = await createDatabaseFile(
      failedAssetId,
      AssetFileStatus.FAILED,
      'image/png',
      {
        lastError: 'PROCESSING_FAILED',
      },
    );
    const replacementAssetId = await createDatabaseAsset();
    const replacementReady = await createDatabaseFile(replacementAssetId, AssetFileStatus.READY);
    await createDatabaseFile(replacementAssetId, AssetFileStatus.UPLOADING);
    const emptyAssetId = await createDatabaseAsset();
    const archivedAssetId = await createDatabaseAsset(AssetType.IMAGE, {
      status: ContentStatus.ARCHIVED,
    });

    const readyResponse = await getAsset(adminCookie, readyAssetId).expect(200);
    expect(readyResponse.body.file).toMatchObject({
      id: readyFile.id,
      status: AssetFileStatus.READY,
    });
    const failedResponse = await getAsset(adminCookie, failedAssetId).expect(200);
    expect(failedResponse.body.file).toMatchObject({
      id: failedFile.id,
      status: AssetFileStatus.FAILED,
      lastError: 'PROCESSING_FAILED',
    });
    const replacementResponse = await getAsset(adminCookie, replacementAssetId).expect(200);
    expect(replacementResponse.body.file).toMatchObject({
      id: replacementReady.id,
      status: AssetFileStatus.READY,
    });
    expect(
      await getAsset(adminCookie, emptyAssetId)
        .expect(200)
        .then((res) => res.body.file),
    ).toBeNull();
    expect((await getAsset(adminCookie, archivedAssetId).expect(200)).body.status).toBe(
      ContentStatus.ARCHIVED,
    );

    const detail = readyResponse.body;
    expect(Object.keys(detail).sort()).toEqual(
      ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt', 'file', 'usedIn'].sort(),
    );
    expect(Object.keys(detail.file).sort()).toEqual(
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
    expect(JSON.stringify(detail)).not.toMatch(
      /storageKey|playbackKey|uploadId|processingJobId|storage_key|playback_key|upload_id|processing_job_id/i,
    );
    await getAsset(adminCookie, '550e8400-e29b-41d4-a716-446655440099').expect(404);
    await getAsset(adminCookie, 'invalid-id').expect(404);
  });

  it('lists distinct asset usage across top-level and nested blocks, ordered with a capped total', async () => {
    const assetId = await createDatabaseAsset();
    const alphaCourse = await createDatabaseCourse(`A ${randomUUID()}`);
    const alphaFirstModule = await createDatabaseModule(alphaCourse.id, 'First module', 1);
    const alphaSecondModule = await createDatabaseModule(alphaCourse.id, 'Second module', 2);
    const firstLesson = await createDatabaseLesson(
      alphaCourse.id,
      alphaFirstModule.id,
      'First lesson',
      1,
      ContentStatus.ARCHIVED,
    );
    const secondLesson = await createDatabaseLesson(
      alphaCourse.id,
      alphaSecondModule.id,
      'Second lesson',
    );
    const betaCourse = await createDatabaseCourse(`B ${randomUUID()}`);
    const betaModule = await createDatabaseModule(betaCourse.id, 'Beta module');
    const thirdLesson = await createDatabaseLesson(betaCourse.id, betaModule.id, 'Third lesson');

    await prisma.lessonBlock.create({
      data: {
        lessonId: firstLesson.id,
        type: BlockType.IMAGE,
        content: {},
        assetId,
        position: 1,
      },
    });
    const twoColumnBlock = await prisma.lessonBlock.create({
      data: {
        lessonId: firstLesson.id,
        type: BlockType.TWO_COLUMN,
        content: {},
        position: 2,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: firstLesson.id,
        type: BlockType.IMAGE,
        content: {},
        assetId,
        parentBlockId: twoColumnBlock.id,
        columnIndex: 0,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: secondLesson.id,
        type: BlockType.IMAGE,
        content: {},
        assetId,
        position: 1,
      },
    });
    await prisma.lessonBlock.create({
      data: {
        lessonId: thirdLesson.id,
        type: BlockType.IMAGE,
        content: {},
        assetId,
        position: 1,
      },
    });

    const usage = (await getAsset(adminCookie, assetId).expect(200)).body.usedIn;
    expect(usage.total).toBe(3);
    expect(usage.items.map((item: { lessonId: string }) => item.lessonId)).toEqual([
      firstLesson.id,
      secondLesson.id,
      thirdLesson.id,
    ]);
    expect(usage.items[0]).toMatchObject({
      lessonId: firstLesson.id,
      lessonTitle: 'First lesson',
      lessonStatus: ContentStatus.ARCHIVED,
      moduleId: alphaFirstModule.id,
      moduleTitle: alphaFirstModule.title,
      courseId: alphaCourse.id,
      courseTitle: alphaCourse.title,
    });
    expect(usage.items).toHaveLength(3);

    const cappedAssetId = await createDatabaseAsset();
    const capCourse = await createDatabaseCourse(`Cap ${randomUUID()}`);
    const capModule = await createDatabaseModule(capCourse.id, 'Cap module');
    const manyLessons = Array.from({ length: 51 }, (_, index) => ({
      id: randomUUID().toLowerCase(),
      moduleId: capModule.id,
      courseId: capCourse.id,
      title: `Lesson ${index + 1}`,
      position: index + 1,
      status: ContentStatus.DRAFT,
    }));
    await prisma.lesson.createMany({ data: manyLessons });
    createdLessonIds.push(...manyLessons.map((lesson) => lesson.id));
    await prisma.lessonBlock.createMany({
      data: manyLessons.map((lesson) => ({
        lessonId: lesson.id,
        type: BlockType.IMAGE,
        content: {},
        assetId: cappedAssetId,
        position: 1,
      })),
    });
    const cappedUsage = (await getAsset(adminCookie, cappedAssetId).expect(200)).body.usedIn;
    expect(cappedUsage.total).toBe(51);
    expect(cappedUsage.items).toHaveLength(50);

    const unusedAssetId = await createDatabaseAsset();
    expect((await getAsset(adminCookie, unusedAssetId).expect(200)).body.usedIn).toEqual({
      total: 0,
      items: [],
    });
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
      sizeBytes: 16,
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
