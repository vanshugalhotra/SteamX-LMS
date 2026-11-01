/** Reads and replaces lesson block rows within the content service's transactions. */
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

  /** Runs related database work in one transaction with a 15-second timeout. */
  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback, { timeout: 15_000 });
  }

  /**
   * Locks the lesson row so concurrent content saves for that lesson serialize.
   * @returns The locked lesson ID and version, or null when the lesson is missing.
   */
  async lockLesson(
    tx: Prisma.TransactionClient,
    lessonId: string,
  ): Promise<{ id: string; content_version: number } | null> {
    const rows = await tx.$queryRaw<Array<{ id: string; content_version: number }>>`
      SELECT id, content_version FROM lessons WHERE id = ${lessonId}::uuid FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Reads the lesson version and ordered blocks from one repeatable-read transaction.
   * @returns An empty block list and null version when the lesson is missing.
   */
  findSnapshot(lessonId: string): Promise<{
    lessonVersion: { contentVersion: number } | null;
    blocks: LessonContentBlockRow[];
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        const lessonVersion = await tx.lesson.findUnique({
          where: { id: lessonId },
          select: { contentVersion: true },
        });
        if (!lessonVersion) return { lessonVersion, blocks: [] };

        const blocks = await tx.lessonBlock.findMany({
          where: { lessonId },
          orderBy: [{ position: 'asc' }, { columnIndex: 'asc' }],
          select: LESSON_CONTENT_BLOCK_SELECT,
        });
        return { lessonVersion, blocks };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15_000,
      },
    );
  }

  /**
   * Reads a lesson's ordered block rows from the supplied transaction when present.
   * @param tx Uses the active save transaction when supplied; otherwise uses Prisma directly.
   */
  findBlocks(lessonId: string, tx?: Prisma.TransactionClient): Promise<LessonContentBlockRow[]> {
    return (tx ?? this.prisma).lessonBlock.findMany({
      where: { lessonId },
      orderBy: [{ position: 'asc' }, { columnIndex: 'asc' }],
      select: LESSON_CONTENT_BLOCK_SELECT,
    });
  }

  /**
   * Finds requested block IDs owned by another lesson; IDs already in this lesson are allowed.
   */
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

  /** Removes child blocks before all remaining lesson blocks for a full-tree replacement. */
  async deleteBlocks(tx: Prisma.TransactionClient, lessonId: string): Promise<void> {
    await tx.lessonBlock.deleteMany({
      where: { lessonId, parentBlockId: { not: null } },
    });
    await tx.lessonBlock.deleteMany({ where: { lessonId } });
  }

  /** Inserts top-level blocks before column children in the replacement transaction. */
  async createTopLevelBlocks(
    tx: Prisma.TransactionClient,
    data: ReturnType<typeof import('./tree/walk-blocks.js').flattenBlocks>['topLevel'],
  ): Promise<void> {
    if (data.length > 0) await tx.lessonBlock.createMany({ data });
  }

  /** Inserts column children after their parent layout blocks exist. */
  async createChildBlocks(
    tx: Prisma.TransactionClient,
    data: ReturnType<typeof import('./tree/walk-blocks.js').flattenBlocks>['children'],
  ): Promise<void> {
    if (data.length > 0) await tx.lessonBlock.createMany({ data });
  }

  /** Increments the content version once after the complete replacement has been inserted. */
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
