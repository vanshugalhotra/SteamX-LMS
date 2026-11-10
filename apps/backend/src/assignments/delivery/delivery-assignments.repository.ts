/** Persists delivery assignment lifecycle operations and page-level aggregate counts. */
import { Injectable } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AssignmentBlueprint } from '../blueprint/blueprint.schema.js';
import type { UpdateDeliveryAssignmentDto } from '../dto/delivery-assignment.dto.js';

const ASSIGNMENT_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  dueAt: true,
  moduleId: true,
  lessonId: true,
  allowResubmission: true,
  rubric: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AssignmentSelect;

const ASSIGNMENT_DETAIL_INCLUDE = {
  items: {
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.AssignmentInclude;

export type AssignmentListRecord = Prisma.AssignmentGetPayload<{
  select: typeof ASSIGNMENT_LIST_SELECT;
}>;
export type AssignmentDetailRecord = Prisma.AssignmentGetPayload<{
  include: typeof ASSIGNMENT_DETAIL_INCLUDE;
}>;

/** Stores delivery-scoped assignments, their content, and their summary aggregates. */
@Injectable()
export class DeliveryAssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates an assignment and its complete nested item content in one transaction. */
  create(data: {
    schoolId: string;
    deliveryId: string;
    courseId: string;
    moduleId: string | null;
    lessonId: string | null;
    title: string;
    description: string | null;
    dueAt: Date | null;
    createdById: string;
    blueprint: AssignmentBlueprint;
    sourceTemplateId?: string;
  }): Promise<AssignmentDetailRecord> {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          schoolId: data.schoolId,
          deliveryId: data.deliveryId,
          courseId: data.courseId,
          moduleId: data.moduleId,
          lessonId: data.lessonId,
          title: data.title,
          description: data.description,
          dueAt: data.dueAt,
          createdById: data.createdById,
          allowResubmission: data.blueprint.allowResubmission,
          rubric: jsonValue(data.blueprint.rubric),
          ...(data.sourceTemplateId === undefined
            ? {}
            : { sourceTemplateId: data.sourceTemplateId }),
        },
      });
      await this.insertItems(tx, assignment.id, data.blueprint);
      return this.requireDetail(tx, assignment.id, data.deliveryId);
    });
  }

  /** Lists assignment summaries under one delivery and orders newest updates first. */
  findMany(
    deliveryId: string,
    query: { status?: AssignmentStatus; page: number; limit: number },
  ): Promise<{ items: AssignmentListRecord[]; total: number }> {
    const where: Prisma.AssignmentWhereInput = {
      deliveryId,
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const orderBy = [
      { updatedAt: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.AssignmentOrderByWithRelationInput[];
    return Promise.all([
      this.prisma.assignment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: ASSIGNMENT_LIST_SELECT,
      }),
      this.prisma.assignment.count({ where }),
    ]).then(([items, total]) => ({ items, total }));
  }

  /** Reads item and submission counts using two grouped queries for the requested page. */
  async findCounts(
    assignmentIds: string[],
  ): Promise<Map<string, { itemCount: number; submissionCount: number; gradedCount: number }>> {
    const counts = new Map<
      string,
      { itemCount: number; submissionCount: number; gradedCount: number }
    >();
    for (const id of assignmentIds) {
      counts.set(id, { itemCount: 0, submissionCount: 0, gradedCount: 0 });
    }
    if (assignmentIds.length === 0) {
      return counts;
    }
    const [itemGroups, submissionGroups] = await Promise.all([
      this.prisma.assignmentItem.groupBy({
        by: ['assignmentId'],
        where: { assignmentId: { in: assignmentIds } },
        _count: { _all: true },
      }),
      this.prisma.submission.groupBy({
        by: ['assignmentId', 'status'],
        where: { assignmentId: { in: assignmentIds } },
        _count: { _all: true },
      }),
    ]);
    for (const group of itemGroups) {
      const count = counts.get(group.assignmentId);
      if (count) {
        count.itemCount = group._count._all;
      }
    }
    for (const group of submissionGroups) {
      const count = counts.get(group.assignmentId);
      if (count) {
        count.submissionCount += group._count._all;
        if (group.status === 'GRADED') {
          count.gradedCount = group._count._all;
        }
      }
    }
    return counts;
  }

  /** Finds an assignment only when it belongs to the already-visible delivery. */
  findById(deliveryId: string, id: string): Promise<AssignmentDetailRecord | null> {
    return this.prisma.assignment.findFirst({
      where: { deliveryId, id },
      include: ASSIGNMENT_DETAIL_INCLUDE,
    });
  }

  /** Applies a patch and replaces item and option rows atomically when supplied. */
  async update(
    deliveryId: string,
    id: string,
    body: UpdateDeliveryAssignmentDto,
    items: AssignmentBlueprint['items'] | undefined,
    rubric: AssignmentBlueprint['rubric'] | undefined,
  ): Promise<AssignmentDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        await tx.assignmentItemOption.deleteMany({
          where: { item: { is: { assignmentId: id } } },
        });
        await tx.assignmentItem.deleteMany({ where: { assignmentId: id } });
        await this.insertItems(tx, id, { items });
      }
      const update = await tx.assignment.updateMany({
        where: { id, deliveryId },
        data: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.dueAt === undefined
            ? {}
            : { dueAt: body.dueAt === null ? null : new Date(body.dueAt) }),
          ...(body.allowResubmission === undefined
            ? {}
            : { allowResubmission: body.allowResubmission }),
          ...(rubric === undefined ? {} : { rubric: jsonValue(rubric) }),
        },
      });
      if (update.count === 0) {
        return null;
      }
      return this.requireDetail(tx, id, deliveryId);
    });
  }

  /** Changes a DRAFT or UNPUBLISHED assignment to PUBLISHED with a stable first timestamp. */
  async publish(
    deliveryId: string,
    id: string,
    currentStatus: AssignmentStatus,
    publishedAt: Date,
  ): Promise<AssignmentDetailRecord | null> {
    const changed = await this.prisma.assignment.updateMany({
      where: { id, deliveryId, status: currentStatus },
      data: { status: AssignmentStatus.PUBLISHED, publishedAt },
    });
    return changed.count === 0 ? null : this.findByIdOrThrow(deliveryId, id);
  }

  /** Changes a PUBLISHED assignment to UNPUBLISHED without clearing its first publish time. */
  async unpublish(
    deliveryId: string,
    id: string,
    currentStatus: AssignmentStatus,
  ): Promise<AssignmentDetailRecord | null> {
    const changed = await this.prisma.assignment.updateMany({
      where: { id, deliveryId, status: currentStatus },
      data: { status: AssignmentStatus.UNPUBLISHED },
    });
    return changed.count === 0 ? null : this.findByIdOrThrow(deliveryId, id);
  }

  /** Deletes options, items, and an assignment in one transaction when it has no submissions. */
  deleteIfUnused(deliveryId: string, id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if ((await tx.submission.count({ where: { assignmentId: id } })) > 0) {
        return false;
      }
      await tx.assignment.updateMany({
        where: { id, deliveryId, status: AssignmentStatus.PUBLISHED },
        data: { status: AssignmentStatus.UNPUBLISHED },
      });
      await tx.assignmentItemOption.deleteMany({
        where: { item: { is: { assignmentId: id } } },
      });
      await tx.assignmentItem.deleteMany({ where: { assignmentId: id } });
      const deleted = await tx.assignment.deleteMany({ where: { id, deliveryId } });
      return deleted.count > 0;
    });
  }

  /** Inserts each item with its options in the requested array order. */
  private async insertItems(
    tx: Prisma.TransactionClient,
    assignmentId: string,
    blueprint: Pick<AssignmentBlueprint, 'items'>,
  ): Promise<void> {
    for (const [index, item] of blueprint.items.entries()) {
      await tx.assignmentItem.create({
        data: {
          assignmentId,
          position: index + 1,
          type: item.type,
          prompt: item.prompt,
          config: item.config === undefined ? Prisma.DbNull : jsonValue(item.config),
          options: {
            create: (item.options ?? []).map((option, optionIndex) => ({
              position: optionIndex + 1,
              text: option.text,
              isCorrect: option.isCorrect,
            })),
          },
        },
      });
    }
  }

  /** Loads a newly written assignment with its ordered nested content. */
  private async requireDetail(
    tx: Prisma.TransactionClient,
    id: string,
    deliveryId: string,
  ): Promise<AssignmentDetailRecord> {
    const record = await tx.assignment.findFirst({
      where: { id, deliveryId },
      include: ASSIGNMENT_DETAIL_INCLUDE,
    });
    if (!record) {
      throw new Error('Expected assignment to exist after a successful write.');
    }
    return record;
  }

  /** Loads the record after a successful conditional lifecycle update. */
  private async findByIdOrThrow(deliveryId: string, id: string): Promise<AssignmentDetailRecord> {
    const record = await this.findById(deliveryId, id);
    if (!record) {
      throw new Error('Expected assignment to exist after a successful status update.');
    }
    return record;
  }
}

/** Converts nullable JSON values to Prisma's explicit database-null input. */
function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null
    ? Prisma.DbNull
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}
