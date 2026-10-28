import { randomUUID } from 'node:crypto';
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
  LessonAudience,
} from '../../../src/generated/prisma/client.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { createTestAsset, createTestAssetFile } from './assets.js';

export type TestLessonBlock = {
  id: string;
  type: BlockType;
  assetId?: string;
  content: Record<string, unknown>;
  columns?: [TestLessonBlock | null, TestLessonBlock | null];
};

export async function createTestCurriculumLesson(
  prisma: PrismaService,
  options: {
    status?: ContentStatus;
    audience?: LessonAudience;
    contentVersion?: number;
    lessonTitle?: string;
  } = {},
): Promise<{ courseId: string; moduleId: string; lessonId: string }> {
  const active = options.status === ContentStatus.ACTIVE;
  const course = await prisma.course.create({
    data: {
      title: `Course ${randomUUID()}`,
      ...(active ? { status: ContentStatus.ACTIVE } : {}),
    },
  });
  const module = await prisma.module.create({
    data: {
      courseId: course.id,
      title: `Module ${randomUUID()}`,
      position: 1,
      ...(active ? { status: ContentStatus.ACTIVE } : {}),
    },
  });
  const lesson = await prisma.lesson.create({
    data: {
      courseId: course.id,
      moduleId: module.id,
      title: options.lessonTitle ?? `Lesson ${randomUUID()}`,
      position: 1,
      status: options.status ?? ContentStatus.DRAFT,
      audience: options.audience ?? LessonAudience.TEACHER_ONLY,
      contentVersion: options.contentVersion ?? 0,
    },
  });
  return { courseId: course.id, moduleId: module.id, lessonId: lesson.id };
}

export async function createTestAssetWithReadyFile(
  prisma: PrismaService,
  type: AssetType,
  options: {
    status?: ContentStatus;
    title?: string;
    originalFilename?: string;
    sizeBytes?: number;
  } = {},
): Promise<{ assetId: string; fileId: string; storageKey: string }> {
  const assetId = await createTestAsset(prisma, {
    type,
    status: options.status,
    title: options.title,
  });
  const mimeType =
    type === AssetType.IMAGE
      ? 'image/png'
      : type === AssetType.VIDEO
        ? 'video/mp4'
        : 'application/pdf';
  const file = await createTestAssetFile(prisma, assetId, AssetFileStatus.READY, mimeType, {
    ...(options.originalFilename === undefined
      ? {}
      : { originalFilename: options.originalFilename }),
    ...(options.sizeBytes === undefined ? {} : { sizeBytes: options.sizeBytes }),
  });
  return { assetId, fileId: file.id, storageKey: file.storageKey };
}

export function makeRichTextBlock(
  id = randomUUID(),
  text = 'Test lesson content',
): TestLessonBlock {
  return {
    id,
    type: BlockType.RICH_TEXT,
    content: {
      format: 'tiptap',
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
  };
}

export function makeImageBlock(assetId: string, id = randomUUID()): TestLessonBlock {
  return { id, type: BlockType.IMAGE, assetId, content: { alt: 'Test image' } };
}

export function makeTwoColumnBlock(
  columns: [TestLessonBlock | null, TestLessonBlock | null],
  id = randomUUID(),
): TestLessonBlock {
  return { id, type: BlockType.TWO_COLUMN, content: {}, columns };
}

export function buildSavedLessonTree(assetId: string, variant = 0): TestLessonBlock[] {
  return [
    makeRichTextBlock(randomUUID(), `Lesson revision ${variant}`),
    makeTwoColumnBlock([makeImageBlock(assetId), variant % 2 === 0 ? makeRichTextBlock() : null]),
  ];
}
