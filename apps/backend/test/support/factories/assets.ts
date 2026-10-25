import { randomUUID } from 'node:crypto';
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
} from '../../../src/generated/prisma/client.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { buildOriginalKey } from '../../../src/assets/asset-rules.js';

export async function createTestAsset(
  prisma: PrismaService,
  options: {
    type?: AssetType;
    title?: string;
    status?: ContentStatus;
    createdAt?: Date;
  } = {},
): Promise<string> {
  const id = randomUUID().toLowerCase();
  await prisma.asset.create({
    data: {
      id,
      type: options.type ?? AssetType.IMAGE,
      title: options.title ?? `Test asset ${id}`,
      status: options.status,
      createdAt: options.createdAt,
    },
  });
  return id;
}

export async function createTestAssetFile(
  prisma: PrismaService,
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
): Promise<{ id: string; storageKey: string }> {
  const id = options.fileId ?? randomUUID().toLowerCase();
  const storageKey = buildOriginalKey(assetId, id);
  await prisma.assetFile.create({
    data: {
      id,
      assetId,
      storageKey,
      originalFilename: options.originalFilename ?? 'direct-test.png',
      mimeType,
      sizeBytes: 16n,
      createdAt: options.createdAt,
    },
  });

  if (status === AssetFileStatus.UPLOADING) {
    return { id, storageKey };
  }

  const uploaded = await prisma.assetFile.update({
    where: { id },
    data: { status: AssetFileStatus.UPLOADED },
  });
  if (status === AssetFileStatus.UPLOADED) {
    return { id: uploaded.id, storageKey };
  }

  const progressed = await prisma.assetFile.update({
    where: { id },
    data: {
      status:
        status === AssetFileStatus.FAILED ? AssetFileStatus.FAILED : AssetFileStatus.PROCESSING,
      lastError: options.lastError,
    },
  });
  if (status !== AssetFileStatus.READY) {
    return { id: progressed.id, storageKey };
  }

  const playbackKey = options.playbackKey ?? (mimeType === 'video/mp4' ? storageKey : undefined);
  await prisma.assetFile.update({
    where: { id },
    data: {
      status: AssetFileStatus.READY,
      ...(playbackKey !== undefined && { playbackKey }),
    },
  });
  return { id, storageKey };
}

export async function createLessonWithAssetBlock(
  prisma: PrismaService,
  assetId: string,
  options: { nested?: boolean } = {},
): Promise<{
  courseId: string;
  moduleId: string;
  lessonId: string;
  blockId: string;
  parentBlockId?: string;
}> {
  const course = await prisma.course.create({ data: { title: `Asset test ${randomUUID()}` } });
  const module = await prisma.module.create({
    data: { courseId: course.id, title: 'Asset test module', position: 1 },
  });
  const lesson = await prisma.lesson.create({
    data: { courseId: course.id, moduleId: module.id, title: 'Asset test lesson', position: 1 },
  });
  const parent = options.nested
    ? await prisma.lessonBlock.create({
        data: {
          lessonId: lesson.id,
          type: BlockType.TWO_COLUMN,
          content: {},
          position: 1,
        },
      })
    : undefined;
  const block = await prisma.lessonBlock.create({
    data: {
      lessonId: lesson.id,
      type: BlockType.IMAGE,
      content: {},
      assetId,
      ...(parent ? { parentBlockId: parent.id, columnIndex: 0 } : { position: 1 }),
    },
  });
  return {
    courseId: course.id,
    moduleId: module.id,
    lessonId: lesson.id,
    blockId: block.id,
    ...(parent ? { parentBlockId: parent.id } : {}),
  };
}
