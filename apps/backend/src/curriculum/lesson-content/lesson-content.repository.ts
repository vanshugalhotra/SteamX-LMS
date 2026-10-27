import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { LessonContentBlockRow } from './build-block-tree.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  constructor(private readonly prisma: PrismaService) {}

  findVersion(lessonId: string): Promise<{ contentVersion: number } | null> {
    return this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { contentVersion: true },
    });
  }

  findBlocks(lessonId: string): Promise<LessonContentBlockRow[]> {
    return this.prisma.lessonBlock.findMany({
      where: { lessonId },
      orderBy: [{ position: 'asc' }, { columnIndex: 'asc' }],
      select: LESSON_CONTENT_BLOCK_SELECT,
    });
  }
}
