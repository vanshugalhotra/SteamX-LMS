/**
 * Read model for lesson/module/course/block usage; all writes belong to their owning folders
 * (same exception as the course outline).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// The library view is not a report; total always holds the real count.
const USAGE_LIMIT = 50;

const USAGE_LESSON_SELECT = {
  id: true,
  title: true,
  status: true,
  courseId: true,
  module: {
    select: {
      id: true,
      title: true,
      course: { select: { title: true } },
    },
  },
} satisfies Prisma.LessonSelect;

type UsageLesson = Prisma.LessonGetPayload<{ select: typeof USAGE_LESSON_SELECT }>;

@Injectable()
export class AssetUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists up to 50 lessons referencing the asset and returns the uncapped total count. */
  async findByAssetId(assetId: string): Promise<{ items: UsageLesson[]; total: number }> {
    const where: Prisma.LessonWhereInput = {
      blocks: { some: { assetId } },
    };
    const [items, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where,
        select: USAGE_LESSON_SELECT,
        orderBy: [
          { course: { title: 'asc' } },
          { module: { position: 'asc' } },
          { position: 'asc' },
        ],
        take: USAGE_LIMIT,
      }),
      this.prisma.lesson.count({ where }),
    ]);
    return { items, total };
  }
}
