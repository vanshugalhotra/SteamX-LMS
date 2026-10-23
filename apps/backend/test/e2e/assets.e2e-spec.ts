import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import type { Env } from '../../src/config/env.schema.js';
import { AssetFileStatus, AssetType, ContentStatus } from '../../src/generated/prisma/client.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { loginAsCookie } from '../support/login.js';
import { createTestApp } from '../support/create-test-app.js';

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
  });

  afterAll(async () => {
    if (createdAssetIds.length > 0) {
      const files = await prisma.assetFile.findMany({
        where: { assetId: { in: createdAssetIds } },
        select: { assetId: true, id: true },
      });
      await prisma.assetFile.deleteMany({ where: { assetId: { in: createdAssetIds } } });
      await prisma.storageCleanupQueue.deleteMany({
        where: {
          objectKey: {
            in: files.map(({ assetId, id }) => `assets/${assetId}/${id}/`),
          },
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
});
