/** Covers the lesson content read shape, referenced assets, ordering, and access boundary. */
import { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
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
import {
  collectAssetIds,
  validateLessonContent,
} from '../../src/curriculum/lesson-content/validate-lesson-content.js';
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
  let adminCookie: string;
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
    revokeTeacherPermissions = teacherGrant.revoke;
    revokeStudentPermissions = studentGrant.revoke;

    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    fixture = await createTwoSchoolFixture(prisma);
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
    await revokeStudentPermissions?.();
    await revokeTeacherPermissions?.();
    await setupClient?.$disconnect();
    await setupPool?.end();
  });

  beforeEach(async () => {
    adminCookie = await loginAsCookie(app, fixture.admin);
  });

  function getContent(cookie: string, lessonId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/lessons/${lessonId}/content`)
      .set('Cookie', cookie);
  }

  async function createLesson(
    options: {
      status?: ContentStatus;
      audience?: LessonAudience;
      contentVersion?: number;
    } = {},
  ): Promise<string> {
    const course = await prisma.course.create({ data: { title: `Course ${randomUUID()}` } });
    createdCourseIds.push(course.id);
    const module = await prisma.module.create({
      data: { courseId: course.id, title: 'Module', position: 1 },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        moduleId: module.id,
        title: 'Lesson',
        position: 1,
        status: ContentStatus.DRAFT,
        audience: options.audience ?? LessonAudience.TEACHER_ONLY,
        contentVersion: options.contentVersion ?? 0,
      },
    });
    if (options.status === ContentStatus.ARCHIVED) {
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: { status: ContentStatus.ARCHIVED },
      });
    }
    return lesson.id;
  }

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

  it('returns 404 for unknown and malformed IDs, 401 without auth, and 403 for school users', async () => {
    const lessonId = await createLesson();
    await getContent(adminCookie, randomUUID()).expect(404);
    await getContent(adminCookie, 'not-a-uuid').expect(404);
    await request(app.getHttpServer()).get(`/api/v1/lessons/${lessonId}/content`).expect(401);

    for (const user of [
      fixture.schoolA.teacher,
      fixture.schoolA.student,
      fixture.schoolB.teacher,
    ]) {
      const cookie = await loginAsCookie(app, user);
      await getContent(cookie, lessonId).expect(403);
    }
  });
});
