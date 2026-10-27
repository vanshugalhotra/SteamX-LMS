// Database queries and writes used by the lesson-content service.
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { LessonContentBlockRow } from './tree/build-block-tree.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// These are the database fields needed to rebuild the blocks sent to the client.
const LESSON_CONTENT_BLOCK_SELECT = {
  id: true,
  type: true,
  assetId: true,
  content: true,
  position: true,
  parentBlockId: true,
  columnIndex: true,
} satisfies Prisma.LessonBlockSelect;

@Injectable()
export class LessonContentRepository {
  /** Inject Prisma so this repository can query the database. */
  constructor(private readonly prisma: PrismaService) {}

  // Run related database work together; an error rolls back all changes in the callback.
  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback, { timeout: 15_000 });
  }

  // Lock the lesson row so two saves for the same lesson run one after the other.
  async lockLesson(
    tx: Prisma.TransactionClient,
    lessonId: string,
  ): Promise<{ id: string; content_version: number } | null> {
    const rows = await tx.$queryRaw<Array<{ id: string; content_version: number }>>`
      SELECT id, content_version FROM lessons WHERE id = ${lessonId}::uuid FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  // Read only the current version, used by the lesson-content GET endpoint.
  findVersion(lessonId: string): Promise<{ contentVersion: number } | null> {
    return this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { contentVersion: true },
    });
  }

  // Read a lesson's saved block rows; pass tx when this read belongs to a save.
  findBlocks(lessonId: string, tx?: Prisma.TransactionClient): Promise<LessonContentBlockRow[]> {
    // Use the save transaction when given one; otherwise use the regular Prisma client.
    return (tx ?? this.prisma).lessonBlock.findMany({
      where: { lessonId },
      orderBy: [{ position: 'asc' }, { columnIndex: 'asc' }],
      select: LESSON_CONTENT_BLOCK_SELECT,
    });
  }

  // Find incoming block IDs that already belong to a different lesson.
  // Reusing an ID from this lesson is allowed; taking another lesson's ID is not.
  findForeignBlockIds(
    tx: Prisma.TransactionClient,
    lessonId: string,
    blockIds: string[],
  ): Promise<Array<{ id: string }>> {
    return tx.lessonBlock.findMany({
      where: { id: { in: blockIds }, lessonId: { not: lessonId } },
      select: { id: true },
    });
  }

  // Remove children first because each child points to its parent layout.
  // Then remove all remaining blocks so the new tree can be inserted from scratch.
  async deleteBlocks(tx: Prisma.TransactionClient, lessonId: string): Promise<void> {
    await tx.lessonBlock.deleteMany({
      where: { lessonId, parentBlockId: { not: null } },
    });
    await tx.lessonBlock.deleteMany({ where: { lessonId } });
  }

  // Insert parent blocks first so column children can refer to their layout rows.
  async createTopLevelBlocks(
    tx: Prisma.TransactionClient,
    data: ReturnType<typeof import('./tree/walk-blocks.js').flattenBlocks>['topLevel'],
  ): Promise<void> {
    if (data.length > 0) await tx.lessonBlock.createMany({ data });
  }

  // Insert the blocks inside filled columns after their parent layouts exist.
  async createChildBlocks(
    tx: Prisma.TransactionClient,
    data: ReturnType<typeof import('./tree/walk-blocks.js').flattenBlocks>['children'],
  ): Promise<void> {
    if (data.length > 0) await tx.lessonBlock.createMany({ data });
  }

  // Increase the version once after the complete replacement succeeds.
  incrementVersion(
    tx: Prisma.TransactionClient,
    lessonId: string,
  ): Promise<{ contentVersion: number }> {
    return tx.lesson.update({
      where: { id: lessonId },
      data: { contentVersion: { increment: 1 } },
      select: { contentVersion: true },
    });
  }
}
