/** Covers the lesson content read shape, referenced assets, ordering, and access boundary. */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { vi } from 'vitest';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
  LessonAudience,
  Prisma,
  PrismaClient,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import type { Env } from '../../src/config/env.schema.js';
import { LessonContentRepository } from '../../src/curriculum/lesson-content/lesson-content.repository.js';
import { JSON_BODY_LIMIT } from '../../src/configure-app.js';
import {
  collectAssetIds,
  validateLessonContent,
} from '../../src/curriculum/lesson-content/validation/validate-lesson-content.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { createTestApp } from '../support/create-test-app.js';
import { loginAsCookie } from '../support/login.js';

describe('Lesson content endpoint (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let setupClient: PrismaClient;
  let setupPool: Pool;
  let fixture: TwoSchoolFixture;
  let origin: string;
  let adminCookie: string;
  let revokeAdminPermissions: (() => Promise<void>) | undefined;
  let revokeTeacherPermissions: (() => Promise<void>) | undefined;
  let revokeStudentPermissions: (() => Promise<void>) | undefined;
  const createdCourseIds: string[] = [];
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Lesson content e2e tests require DATABASE_URL.');
    }
    setupPool = new Pool({ connectionString: databaseUrl });
    setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
    await setupClient.$connect();
    const readPermission = [PERMISSION.CURRICULUM_READ];
    const teacherGrant = await grantPermissions(setupClient, 'teacher', readPermission);
    const studentGrant = await grantPermissions(setupClient, 'student', readPermission);
    const adminGrant = await grantPermissions(setupClient, 'admin', [PERMISSION.CURRICULUM_WRITE]);
    revokeAdminPermissions = adminGrant.revoke;
    revokeTeacherPermissions = teacherGrant.revoke;
    revokeStudentPermissions = studentGrant.revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    fixture = await createTwoSchoolFixture(prisma);
    origin =
      app.get<ConfigService<Env, true>>(ConfigService).get('CORS_ORIGINS', { infer: true })[0] ??
      '';
    if (!origin)
      throw new Error('Lesson content e2e tests require a configured CORS_ORIGINS entry.');
  });

  afterAll(async () => {
    if (createdCourseIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        const lessons = await tx.lesson.findMany({
          where: { courseId: { in: createdCourseIds } },
          select: { id: true },
        });
        await tx.lessonBlock.deleteMany({
          where: { lessonId: { in: lessons.map(({ id }) => id) } },
        });
        await tx.lesson.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.module.deleteMany({ where: { courseId: { in: createdCourseIds } } });
        await tx.course.deleteMany({ where: { id: { in: createdCourseIds } } });
      });
    }
    if (createdAssetIds.length > 0) {
      await prisma.assetFile.deleteMany({ where: { assetId: { in: createdAssetIds } } });
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
    await revokeAdminPermissions?.();
    await revokeStudentPermissions?.();
    await revokeTeacherPermissions?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  beforeEach(async () => {
    adminCookie = await loginAsCookie(app, fixture.admin);
  });

  /** Read lesson content through the real HTTP endpoint. */
  function getContent(cookie: string, lessonId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/lessons/${lessonId}/content`)
      .set('Cookie', cookie);
  }

  /** Replace lesson content through the real HTTP endpoint. */
  function putContent(cookie: string, lessonId: string, body: object) {
    return request(app.getHttpServer())
      .put(`/api/v1/lessons/${lessonId}/content`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  /** Create a lesson directly in the test database. */
  async function createLesson(
    options: {
      status?: ContentStatus;
      audience?: LessonAudience;
      contentVersion?: number;
    } = {},
  ): Promise<string> {
    const active = options.status === ContentStatus.ACTIVE;
    const course = await prisma.course.create({
      data: {
        title: `Course ${randomUUID()}`,
        ...(active ? { status: ContentStatus.ACTIVE } : {}),
      },
    });
    createdCourseIds.push(course.id);
    const module = await prisma.module.create({
      data: {
        courseId: course.id,
        title: 'Module',
        position: 1,
        ...(active ? { status: ContentStatus.ACTIVE } : {}),
      },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        moduleId: module.id,
        title: 'Lesson',
        position: 1,
        status: options.status ?? ContentStatus.DRAFT,
        audience: options.audience ?? LessonAudience.TEACHER_ONLY,
        contentVersion: options.contentVersion ?? 0,
      },
    });
    return lesson.id;
  }

  /** Create an asset directly in the test database. */
  async function createAsset(
    type: AssetType,
    options: { status?: ContentStatus; fileStatus?: AssetFileStatus } = {},
  ): Promise<string> {
    const asset = await prisma.asset.create({ data: { type, title: `Asset ${randomUUID()}` } });
    createdAssetIds.push(asset.id);
    if (options.status === ContentStatus.ARCHIVED) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: ContentStatus.ARCHIVED },
      });
    }
    if (options.fileStatus) {
      await createFile(asset.id, type, options.fileStatus);
    }
    return asset.id;
  }

  /** Create an asset file in the requested processing state. */
  async function createFile(
    assetId: string,
    type: AssetType,
    status: AssetFileStatus = AssetFileStatus.READY,
  ): Promise<string> {
    const id = randomUUID();
    const mimeType =
      type === AssetType.IMAGE
        ? 'image/png'
        : type === AssetType.VIDEO
          ? 'video/mp4'
          : 'application/pdf';
    await prisma.assetFile.create({
      data: {
        id,
        assetId,
        storageKey: `assets/${assetId}/${id}/original`,
        originalFilename: `${type.toLowerCase()}-file`,
        mimeType,
        sizeBytes: BigInt(1024),
        status: AssetFileStatus.UPLOADING,
      },
    });
    if (status === AssetFileStatus.UPLOADING) return id;
    if (status === AssetFileStatus.FAILED) {
      await prisma.assetFile.update({
        where: { id },
        data: { status, lastError: 'PROCESSING_FAILED' },
      });
      return id;
    }
    await prisma.assetFile.update({
      where: { id },
      data: { status: AssetFileStatus.UPLOADED },
    });
    if (type === AssetType.VIDEO) {
      await prisma.assetFile.update({
        where: { id },
        data: { status: AssetFileStatus.PROCESSING },
      });
    }
    await prisma.assetFile.update({
      where: { id },
      data: {
        status: AssetFileStatus.READY,
        ...(type === AssetType.VIDEO ? { playbackKey: `assets/${assetId}/${id}/original` } : {}),
      },
    });
    return id;
  }

  /** Create one saved block row for read-side test setup. */
  async function createBlock(
    lessonId: string,
    input: {
      type: BlockType;
      content: Prisma.InputJsonValue;
      position?: number;
      assetId?: string;
      parentBlockId?: string;
      columnIndex?: number;
    },
  ) {
    return prisma.lessonBlock.create({
      data: {
        lessonId,
        type: input.type,
        content: input.content,
        position: input.parentBlockId ? null : (input.position ?? 1),
        parentBlockId: input.parentBlockId ?? null,
        columnIndex: input.columnIndex ?? null,
        assetId: input.assetId ?? null,
      },
      select: { id: true },
    });
  }

  it('returns an empty save-shaped response for a lesson without content', async () => {
    const lessonId = await createLesson();

    await expect(getContent(adminCookie, lessonId).expect(200)).resolves.toMatchObject({
      body: { version: 0, blocks: [], assets: {} },
    });
  });

  it('returns the exact nested block tree, unique asset summaries, current file state, and version', async () => {
    const lessonId = await createLesson({
      status: ContentStatus.ARCHIVED,
      audience: LessonAudience.STUDENT,
      contentVersion: 7,
    });
    const imageId = await createAsset(AssetType.IMAGE, { fileStatus: AssetFileStatus.READY });
    const columnOnlyAssetId = await createAsset(AssetType.IMAGE, {
      fileStatus: AssetFileStatus.READY,
    });
    await createFile(imageId, AssetType.IMAGE, AssetFileStatus.UPLOADING);
    const videoId = await createAsset(AssetType.VIDEO, { fileStatus: AssetFileStatus.READY });
    const pdfId = await createAsset(AssetType.PDF, { fileStatus: AssetFileStatus.READY });
    const failedImageId = await createAsset(AssetType.IMAGE, {
      fileStatus: AssetFileStatus.FAILED,
    });
    const archivedImageId = await createAsset(AssetType.IMAGE, {
      status: ContentStatus.ARCHIVED,
      fileStatus: AssetFileStatus.READY,
    });

    const richText = await createBlock(lessonId, {
      type: BlockType.RICH_TEXT,
      content: {
        format: 'tiptap',
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start' }] }],
        },
      },
      position: 1,
    });
    const accordion = await createBlock(lessonId, {
      type: BlockType.ACCORDION,
      content: {
        title: 'Details',
        body: { format: 'tiptap', doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
      },
      position: 2,
    });
    const firstImage = await createBlock(lessonId, {
      type: BlockType.IMAGE,
      assetId: imageId,
      content: { alt: 'First image' },
      position: 3,
    });
    const repeatedImage = await createBlock(lessonId, {
      type: BlockType.IMAGE,
      assetId: imageId,
      content: { alt: 'Repeated image' },
      position: 4,
    });
    const video = await createBlock(lessonId, {
      type: BlockType.VIDEO,
      assetId: videoId,
      content: { caption: 'Video' },
      position: 5,
    });
    const pdf = await createBlock(lessonId, {
      type: BlockType.PDF,
      assetId: pdfId,
      content: { caption: 'PDF' },
      position: 6,
    });
    const failedImage = await createBlock(lessonId, {
      type: BlockType.IMAGE,
      assetId: failedImageId,
      content: { alt: 'Failed image' },
      position: 7,
    });
    const archivedImage = await createBlock(lessonId, {
      type: BlockType.IMAGE,
      assetId: archivedImageId,
      content: { alt: 'Archived asset' },
      position: 8,
    });
    const twoColumn = await createBlock(lessonId, {
      type: BlockType.TWO_COLUMN,
      content: {},
      position: 9,
    });
    const columnImage = await createBlock(lessonId, {
      type: BlockType.IMAGE,
      assetId: imageId,
      content: { alt: 'Column image' },
      parentBlockId: twoColumn.id,
      columnIndex: 0,
    });
    const columnPdf = await createBlock(lessonId, {
      type: BlockType.PDF,
      assetId: pdfId,
      content: { caption: 'Column document' },
      parentBlockId: twoColumn.id,
      columnIndex: 1,
    });
    const partialLayout = await createBlock(lessonId, {
      type: BlockType.TWO_COLUMN,
      content: {},
      position: 10,
    });
    const partialImage = await createBlock(lessonId, {
      type: BlockType.IMAGE,
      assetId: columnOnlyAssetId,
      content: {},
      parentBlockId: partialLayout.id,
      columnIndex: 1,
    });

    const response = await getContent(adminCookie, lessonId).expect(200);
    const body = response.body as {
      version: number;
      blocks: Array<Record<string, unknown> & { id: string; type: BlockType; columns?: unknown[] }>;
      assets: Record<
        string,
        { id: string; status: ContentStatus; file: Record<string, unknown> | null }
      >;
    };
    expect(body.version).toBe(7);
    expect(body.blocks.map(({ id }) => id)).toEqual([
      richText.id,
      accordion.id,
      firstImage.id,
      repeatedImage.id,
      video.id,
      pdf.id,
      failedImage.id,
      archivedImage.id,
      twoColumn.id,
      partialLayout.id,
    ]);
    expect(body.blocks[8]?.columns).toHaveLength(2);
    expect(body.blocks[8]?.columns).toEqual([
      expect.objectContaining({ id: columnImage.id, type: BlockType.IMAGE, assetId: imageId }),
      expect.objectContaining({ id: columnPdf.id, type: BlockType.PDF, assetId: pdfId }),
    ]);
    expect(body.blocks[9]?.columns).toEqual([
      null,
      expect.objectContaining({
        id: partialImage.id,
        type: BlockType.IMAGE,
        assetId: columnOnlyAssetId,
      }),
    ]);
    expect(body.assets[imageId]?.file).toMatchObject({
      status: AssetFileStatus.READY,
      mimeType: 'image/png',
      sizeBytes: 1024,
      originalFilename: 'image-file',
    });
    expect(body.assets[imageId]?.file).not.toHaveProperty('id');
    expect(body.assets[failedImageId]?.file).toMatchObject({
      status: AssetFileStatus.FAILED,
      lastError: 'PROCESSING_FAILED',
    });
    expect(body.assets[archivedImageId]?.status).toBe(ContentStatus.ARCHIVED);
    expect(body.assets[columnOnlyAssetId]).toBeDefined();
    expect(Object.keys(body.assets).sort()).toEqual(
      [imageId, videoId, pdfId, failedImageId, archivedImageId, columnOnlyAssetId].sort(),
    );
    const roundTrip = validateLessonContent({ blocks: body.blocks });
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(roundTrip.blocks).toEqual(body.blocks);
      expect(collectAssetIds(roundTrip.blocks).sort()).toEqual(
        [imageId, videoId, pdfId, failedImageId, archivedImageId, columnOnlyAssetId].sort(),
      );
    }

    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['storageKey', 'playbackKey', 'uploadId', 'processingJobId']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/https?:/i);
  });

  it('returns all 100 blocks and 30 asset summaries in deterministic order', async () => {
    const lessonId = await createLesson();
    const assetIds = await Promise.all(
      Array.from({ length: 30 }, () => createAsset(AssetType.IMAGE)),
    );
    const expectedBlockIds = Array.from({ length: 100 }, () => randomUUID());
    const blocks = Array.from({ length: 100 }, (_, index) => {
      const position = index + 1;
      const assetId = index < assetIds.length ? assetIds[index] : undefined;
      return {
        id: expectedBlockIds[index],
        lessonId,
        type: assetId ? BlockType.IMAGE : BlockType.RICH_TEXT,
        content: assetId ? {} : { format: 'tiptap', doc: { type: 'doc' } },
        position,
        ...(assetId ? { assetId } : {}),
      };
    });
    await prisma.lessonBlock.createMany({ data: blocks });

    const response = await getContent(adminCookie, lessonId).expect(200);
    expect(response.body.blocks).toHaveLength(100);
    expect(response.body.blocks.map((block: { id: string }) => block.id)).toEqual(expectedBlockIds);
    expect(Object.keys(response.body.assets)).toHaveLength(30);
    expect(response.body.blocks[0].assetId).toBe(assetIds[0]);
    expect(response.body.blocks[29].assetId).toBe(assetIds[29]);
  });

  it('saves a mixed block tree, persists its positions, and reads back the same response', async () => {
    const lessonId = await createLesson();
    const imageId = await createAsset(AssetType.IMAGE, { fileStatus: AssetFileStatus.READY });
    const videoId = await createAsset(AssetType.VIDEO, { fileStatus: AssetFileStatus.READY });
    const pdfId = await createAsset(AssetType.PDF, { fileStatus: AssetFileStatus.READY });
    const richText = (id: string, value: string) => ({
      id,
      type: BlockType.RICH_TEXT,
      content: {
        format: 'tiptap',
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
        },
      },
    });
    const blocks = [
      richText(randomUUID(), 'Lesson introduction'),
      {
        id: randomUUID(),
        type: BlockType.ACCORDION,
        content: {
          title: 'Details',
          body: { format: 'tiptap', doc: { type: 'doc' } },
        },
      },
      { id: randomUUID(), type: BlockType.IMAGE, assetId: imageId, content: { alt: 'Diagram' } },
      { id: randomUUID(), type: BlockType.VIDEO, assetId: videoId, content: { caption: 'Clip' } },
      { id: randomUUID(), type: BlockType.PDF, assetId: pdfId, content: { caption: 'Handout' } },
      {
        id: randomUUID(),
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [
          richText(randomUUID(), 'Left column'),
          { id: randomUUID(), type: BlockType.IMAGE, assetId: imageId, content: {} },
        ],
      },
    ];
    const validation = validateLessonContent({ blocks });
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error('Expected the mixed block tree to be valid.');

    const response = await putContent(adminCookie, lessonId, {
      expectedVersion: 0,
      blocks,
    }).expect(200);
    expect(response.body.version).toBe(1);
    expect(response.body.blocks).toEqual(validation.blocks);
    expect(Object.keys(response.body.assets).sort()).toEqual([imageId, pdfId, videoId].sort());

    const rows = await prisma.lessonBlock.findMany({
      where: { lessonId },
      select: {
        id: true,
        type: true,
        assetId: true,
        content: true,
        position: true,
        parentBlockId: true,
        columnIndex: true,
      },
    });
    const topRows = rows.filter(({ parentBlockId }) => parentBlockId === null);
    const childRows = rows.filter(({ parentBlockId }) => parentBlockId !== null);
    expect(
      topRows
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
        .map(({ id, position }) => [id, position]),
    ).toEqual(blocks.map((block, index) => [block.id, index + 1]));
    expect(childRows).toHaveLength(2);
    expect(
      childRows.map(({ id, parentBlockId, columnIndex, position }) => [
        id,
        parentBlockId,
        columnIndex,
        position,
      ]),
    ).toEqual([
      [validation.blocks[5]?.columns?.[0]?.id, validation.blocks[5]?.id, 0, null],
      [validation.blocks[5]?.columns?.[1]?.id, validation.blocks[5]?.id, 1, null],
    ]);
    expect(rows).toHaveLength(8);
    expect((await getContent(adminCookie, lessonId).expect(200)).body).toEqual(response.body);
  });

  it('replaces blocks, preserves re-sent IDs, and makes unchanged retries safe', async () => {
    const lessonId = await createLesson();
    const emptyNoOp = await putContent(adminCookie, lessonId, {
      expectedVersion: 12,
      blocks: [],
    }).expect(200);
    expect(emptyNoOp.body.version).toBe(0);
    const moveIntoColumnId = randomUUID();
    const layoutId = randomUUID();
    const moveToTopId = randomUUID();
    const omittedId = randomUUID();
    const richText = (id: string, text: string) => ({
      id,
      type: BlockType.RICH_TEXT,
      content: {
        format: 'tiptap',
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      },
    });
    const first = [
      richText(moveIntoColumnId, 'Move into column'),
      {
        id: layoutId,
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [richText(moveToTopId, 'Move to top'), null],
      },
      richText(omittedId, 'Remove'),
    ];

    await putContent(adminCookie, lessonId, { expectedVersion: 0, blocks: first }).expect(200);
    const replacement = [
      {
        id: layoutId,
        type: BlockType.TWO_COLUMN,
        content: {},
        columns: [null, richText(moveIntoColumnId, 'Move into column')],
      },
      richText(moveToTopId, 'Move to top'),
    ];
    await putContent(adminCookie, lessonId, {
      expectedVersion: 1,
      blocks: replacement,
    }).expect(200);

    const rows = await prisma.lessonBlock.findMany({
      where: { lessonId },
      orderBy: { position: 'asc' },
      select: { id: true, position: true, parentBlockId: true, columnIndex: true },
    });
    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual({
      id: layoutId,
      position: 1,
      parentBlockId: null,
      columnIndex: null,
    });
    expect(rows).toContainEqual({
      id: moveToTopId,
      position: 2,
      parentBlockId: null,
      columnIndex: null,
    });
    expect(rows).toContainEqual({
      id: moveIntoColumnId,
      position: null,
      parentBlockId: layoutId,
      columnIndex: 1,
    });
    expect(rows.some(({ id }) => id === omittedId)).toBe(false);

    const current = (await getContent(adminCookie, lessonId).expect(200)).body;
    await putContent(adminCookie, lessonId, {
      expectedVersion: current.version,
      blocks: current.blocks,
    }).expect(200);
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(2);

    await putContent(adminCookie, lessonId, { expectedVersion: 2, blocks: [] })
      .expect(200)
      .then(({ body }) => expect(body).toMatchObject({ version: 3, blocks: [], assets: {} }));
    await putContent(adminCookie, lessonId, { expectedVersion: 2, blocks: [] })
      .expect(200)
      .then(({ body }) => expect(body.version).toBe(3));
    expect(await prisma.lessonBlock.count({ where: { lessonId } })).toBe(0);
  });

  it('rejects stale versions and invalid request/content fields without changing stored data', async () => {
    const lessonId = await createLesson();
    const original = {
      id: randomUUID(),
      type: BlockType.RICH_TEXT,
      content: { format: 'tiptap', doc: { type: 'doc' } },
    };
    await putContent(adminCookie, lessonId, { expectedVersion: 0, blocks: [original] }).expect(200);

    const stale = await putContent(adminCookie, lessonId, {
      expectedVersion: 0,
      blocks: [{ ...original, id: randomUUID() }],
    }).expect(409);
    expect(stale.body).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 1 },
    });

    for (const body of [
      { blocks: [] },
      { expectedVersion: -1, blocks: [] },
      { expectedVersion: 0.5, blocks: [] },
      { expectedVersion: '1', blocks: [] },
      { expectedVersion: 1, blocks: [], extra: true },
    ]) {
      await putContent(adminCookie, lessonId, body).expect(400);
    }

    const invalid = await putContent(adminCookie, lessonId, {
      expectedVersion: 1,
      blocks: [{ id: randomUUID(), type: 'UNKNOWN', content: {} }],
    }).expect(400);
    expect(invalid.body).toMatchObject({
      code: 'INVALID_LESSON_CONTENT',
      details: [{ path: 'blocks[0].type', code: 'BLOCK_TYPE_NOT_SUPPORTED' }],
    });
    expect(await prisma.lessonBlock.count({ where: { lessonId } })).toBe(1);
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(1);
  });

  it('rejects block IDs owned by another lesson with the block path', async () => {
    const lessonId = await createLesson();
    const otherLessonId = await createLesson();
    const foreign = await createBlock(otherLessonId, {
      type: BlockType.RICH_TEXT,
      content: { format: 'tiptap', doc: { type: 'doc' } },
    });

    const response = await putContent(adminCookie, lessonId, {
      expectedVersion: 0,
      blocks: [
        {
          id: foreign.id,
          type: BlockType.RICH_TEXT,
          content: { format: 'tiptap', doc: { type: 'doc' } },
        },
      ],
    }).expect(400);

    expect(response.body).toMatchObject({
      code: 'INVALID_LESSON_CONTENT',
      details: [{ path: 'blocks[0]', code: 'BLOCK_ID_IN_USE' }],
    });
    expect(await prisma.lessonBlock.count({ where: { lessonId } })).toBe(0);
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(0);
  });

  it('rejects unsupported, nested, duplicate, oversized, malformed-link, and unknown-field blocks', async () => {
    const lessonId = await createLesson();
    const richText = (id: string) => ({
      id,
      type: BlockType.RICH_TEXT,
      content: { format: 'tiptap', doc: { type: 'doc' } },
    });
    const duplicateId = randomUUID();
    const cases: Array<{ blocks: object[]; code: string; path: string }> = [
      {
        blocks: [{ id: randomUUID(), type: 'UNRECOGNIZED', content: {} }],
        code: 'BLOCK_TYPE_NOT_SUPPORTED',
        path: 'blocks[0].type',
      },
      {
        blocks: [{ id: randomUUID(), type: BlockType.PPTX, content: {} }],
        code: 'BLOCK_TYPE_NOT_SUPPORTED',
        path: 'blocks[0].type',
      },
      {
        blocks: [
          {
            id: randomUUID(),
            type: BlockType.TWO_COLUMN,
            content: {},
            columns: [
              {
                id: randomUUID(),
                type: BlockType.TWO_COLUMN,
                content: {},
                columns: [null, null],
              },
              null,
            ],
          },
        ],
        code: 'INVALID_CONTENT',
        path: 'blocks[0].columns[0].type',
      },
      {
        blocks: [richText(duplicateId), richText(duplicateId)],
        code: 'DUPLICATE_ID',
        path: 'blocks[1].id',
      },
      {
        blocks: Array.from({ length: 101 }, () => richText(randomUUID())),
        code: 'TOO_MANY_BLOCKS',
        path: 'blocks[100]',
      },
      {
        blocks: [
          {
            id: randomUUID(),
            type: BlockType.RICH_TEXT,
            content: {
              format: 'tiptap',
              doc: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Unsafe link',
                        marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        code: 'INVALID_LINK',
        path: 'blocks[0].content.doc.content[0].content[0].marks[0].attrs.href',
      },
      {
        blocks: [{ ...richText(randomUUID()), unsupported: true }],
        code: 'UNKNOWN_FIELD',
        path: 'blocks[0].unsupported',
      },
    ];

    for (const { blocks, code, path } of cases) {
      const response = await putContent(adminCookie, lessonId, {
        expectedVersion: 0,
        blocks,
      }).expect(400);
      expect(response.body).toMatchObject({
        code: 'INVALID_LESSON_CONTENT',
        details: [expect.objectContaining({ code, path })],
      });
    }

    expect(await prisma.lessonBlock.count({ where: { lessonId } })).toBe(0);
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(0);
  });

  it('serializes concurrent saves, returns a conflict only for competing content, and rolls back failed inserts', async () => {
    const lessonId = await createLesson();
    const firstPayload = {
      expectedVersion: 0,
      blocks: [
        {
          id: randomUUID(),
          type: BlockType.RICH_TEXT,
          content: { format: 'tiptap', doc: { type: 'doc' } },
        },
      ],
    };
    const identical = await Promise.all([
      putContent(adminCookie, lessonId, firstPayload),
      putContent(adminCookie, lessonId, firstPayload),
    ]);
    expect(identical.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(1);

    const competing = await Promise.all([
      putContent(adminCookie, lessonId, {
        expectedVersion: 1,
        blocks: [
          {
            id: randomUUID(),
            type: BlockType.RICH_TEXT,
            content: { format: 'tiptap', doc: { type: 'doc' } },
          },
        ],
      }),
      putContent(adminCookie, lessonId, {
        expectedVersion: 1,
        blocks: [
          {
            id: randomUUID(),
            type: BlockType.RICH_TEXT,
            content: { format: 'tiptap', doc: { type: 'doc' } },
          },
        ],
      }),
    ]);
    expect(competing.map(({ status }) => status).sort((left, right) => left - right)).toEqual([
      200, 409,
    ]);
    const winner = competing.find(({ status }) => status === 200);
    expect(winner).toBeDefined();
    expect((await getContent(adminCookie, lessonId).expect(200)).body.blocks).toEqual(
      winner?.body.blocks,
    );
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(2);

    const repository = app.get(LessonContentRepository);
    const createChildren = vi
      .spyOn(repository, 'createChildBlocks')
      .mockRejectedValueOnce(new Error('Simulated child insert failure'));
    const failure = await putContent(adminCookie, lessonId, {
      expectedVersion: 2,
      blocks: [
        {
          id: randomUUID(),
          type: BlockType.TWO_COLUMN,
          content: {},
          columns: [
            {
              id: randomUUID(),
              type: BlockType.RICH_TEXT,
              content: { format: 'tiptap', doc: { type: 'doc' } },
            },
            null,
          ],
        },
      ],
    }).expect(500);
    expect(failure.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    createChildren.mockRestore();
    expect((await getContent(adminCookie, lessonId).expect(200)).body.version).toBe(2);
    expect(await prisma.lessonBlock.count({ where: { lessonId } })).toBe(1);
  });

  it('validates new asset references and allows an archived asset already in this lesson', async () => {
    const lessonId = await createLesson();
    const pdfId = await createAsset(AssetType.PDF, { fileStatus: AssetFileStatus.READY });
    const archivedId = await createAsset(AssetType.IMAGE, {
      status: ContentStatus.ARCHIVED,
      fileStatus: AssetFileStatus.READY,
    });
    const uploadingId = await createAsset(AssetType.IMAGE, {
      fileStatus: AssetFileStatus.UPLOADING,
    });
    const failedId = await createAsset(AssetType.IMAGE, { fileStatus: AssetFileStatus.FAILED });
    const cases = [
      { assetId: randomUUID(), code: 'ASSET_NOT_FOUND' },
      { assetId: pdfId, code: 'ASSET_TYPE_MISMATCH' },
      { assetId: archivedId, code: 'ASSET_ARCHIVED' },
      { assetId: uploadingId, code: 'ASSET_NOT_READY' },
      { assetId: failedId, code: 'ASSET_NOT_READY' },
    ];
    for (const { assetId, code } of cases) {
      const response = await putContent(adminCookie, lessonId, {
        expectedVersion: 0,
        blocks: [{ id: randomUUID(), type: BlockType.IMAGE, assetId, content: {} }],
      }).expect(400);
      expect(response.body).toMatchObject({
        code: 'INVALID_LESSON_CONTENT',
        details: [{ path: 'blocks[0].assetId', code }],
      });
    }
    expect(await prisma.lessonBlock.count({ where: { lessonId } })).toBe(0);

    const readyImageId = await createAsset(AssetType.IMAGE, { fileStatus: AssetFileStatus.READY });
    await createFile(readyImageId, AssetType.IMAGE, AssetFileStatus.UPLOADING);
    const imageBlockId = randomUUID();
    await putContent(adminCookie, lessonId, {
      expectedVersion: 0,
      blocks: [{ id: imageBlockId, type: BlockType.IMAGE, assetId: readyImageId, content: {} }],
    }).expect(200);
    await prisma.asset.update({
      where: { id: readyImageId },
      data: { status: ContentStatus.ARCHIVED },
    });
    await putContent(adminCookie, lessonId, {
      expectedVersion: 1,
      blocks: [
        { id: imageBlockId, type: BlockType.IMAGE, assetId: readyImageId, content: {} },
        {
          id: randomUUID(),
          type: BlockType.RICH_TEXT,
          content: { format: 'tiptap', doc: { type: 'doc' } },
        },
      ],
    }).expect(200);
  });

  it('prevents deleting referenced assets until a save removes them and reports where-used lessons', async () => {
    const lessonId = await createLesson();
    const assetId = await createAsset(AssetType.IMAGE, { fileStatus: AssetFileStatus.READY });
    const image = { id: randomUUID(), type: BlockType.IMAGE, assetId, content: {} };
    await putContent(adminCookie, lessonId, { expectedVersion: 0, blocks: [image] }).expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/assets/${assetId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.usedIn.items).toContainEqual(expect.objectContaining({ lessonId }));
    await request(app.getHttpServer())
      .delete(`/api/v1/assets/${assetId}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(409)
      .then(({ body }) => expect(body.code).toBe('RESOURCE_IN_USE'));

    await putContent(adminCookie, lessonId, { expectedVersion: 1, blocks: [] }).expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/assets/${assetId}`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(204);
  });

  it('accepts a JSON lesson body below the configured limit and rejects one above it uniformly', async () => {
    const lessonId = await createLesson();
    const limitBytes = Number.parseInt(JSON_BODY_LIMIT, 10) * 1024 * 1024;
    const makeLargeBlocks = (textLength: number) =>
      Array.from({ length: 100 }, () => ({
        id: randomUUID(),
        type: BlockType.RICH_TEXT,
        content: {
          format: 'tiptap',
          doc: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(textLength) }] },
            ],
          },
        },
      }));
    const belowLimit = { expectedVersion: 0, blocks: makeLargeBlocks(8_800) };
    expect(Buffer.byteLength(JSON.stringify(belowLimit))).toBeLessThan(limitBytes);
    await putContent(adminCookie, lessonId, belowLimit).expect(200);

    const aboveLimit = { expectedVersion: 1, blocks: makeLargeBlocks(12_000) };
    expect(Buffer.byteLength(JSON.stringify(aboveLimit))).toBeGreaterThan(limitBytes);
    const response = await putContent(adminCookie, lessonId, aboveLimit).expect(413);
    expect(response.body).toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      requestId: expect.any(String),
    });
    expect(
      (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).contentVersion,
    ).toBe(1);
  });

  it('saves lessons regardless of status or audience without changing lesson metadata', async () => {
    for (const [status, audience] of [
      [ContentStatus.DRAFT, LessonAudience.TEACHER_ONLY],
      [ContentStatus.ACTIVE, LessonAudience.STUDENT],
      [ContentStatus.ARCHIVED, LessonAudience.TEACHER_ONLY],
    ] as const) {
      const lessonId = await createLesson({ status, audience });
      await putContent(adminCookie, lessonId, {
        expectedVersion: 0,
        blocks: [
          {
            id: randomUUID(),
            type: BlockType.RICH_TEXT,
            content: { format: 'tiptap', doc: { type: 'doc' } },
          },
        ],
      }).expect(200);
      const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
      expect(lesson).toMatchObject({
        title: 'Lesson',
        status,
        audience,
        position: 1,
        contentVersion: 1,
      });
    }
  });

  it('returns 404 for unknown and malformed IDs, 401 without auth, and 403 for school users', async () => {
    const lessonId = await createLesson();
    await getContent(adminCookie, randomUUID()).expect(404);
    await getContent(adminCookie, 'not-a-uuid').expect(404);
    await putContent(adminCookie, randomUUID(), { expectedVersion: 0, blocks: [] }).expect(404);
    await putContent(adminCookie, 'not-a-uuid', { expectedVersion: 0, blocks: [] }).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/lessons/${lessonId}/content`).expect(401);
    await request(app.getHttpServer())
      .put(`/api/v1/lessons/${lessonId}/content`)
      .set('Origin', origin)
      .send({ expectedVersion: 0, blocks: [] })
      .expect(401);

    for (const user of [
      fixture.schoolA.teacher,
      fixture.schoolA.student,
      fixture.schoolB.teacher,
    ]) {
      const cookie = await loginAsCookie(app, user);
      await getContent(cookie, lessonId).expect(403);
      await putContent(cookie, lessonId, { expectedVersion: 0, blocks: [] }).expect(403);
    }
  });
});
