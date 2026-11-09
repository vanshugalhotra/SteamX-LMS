/** Owns assignment template persistence and paginated filtering through Prisma. */
import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma } from '../../generated/prisma/client.js';
import type { AssignmentTemplate } from '../../generated/prisma/client.js';
import { paginatedSearch } from '../../common/repositories/paginated-search.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AssignmentBlueprint } from '../blueprint/blueprint.schema.js';
import type {
  AssignmentTemplateListQueryDto,
  CreateAssignmentTemplateDto,
  UpdateAssignmentTemplateDto,
} from './dto/assignment-template.dto.js';

@Injectable()
export class AssignmentTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a draft template with its creator and immutable course anchor. */
  create(
    body: CreateAssignmentTemplateDto,
    createdById: string,
    blueprint: AssignmentBlueprint,
  ): Promise<AssignmentTemplate> {
    return this.prisma.assignmentTemplate.create({
      data: {
        courseId: body.courseId,
        moduleId: body.moduleId,
        lessonId: body.lessonId,
        title: body.title,
        description: body.description,
        createdById,
        status: ContentStatus.DRAFT,
        blueprint: toJsonInput(blueprint),
      },
    });
  }

  /** Finds templates by filters, ordered by most recently updated. */
  findMany(
    query: AssignmentTemplateListQueryDto,
  ): Promise<{ items: AssignmentTemplate[]; total: number }> {
    const where: Prisma.AssignmentTemplateWhereInput = {
      ...(query.courseId === undefined ? {} : { courseId: query.courseId }),
      ...(query.moduleId === undefined ? {} : { moduleId: query.moduleId }),
      ...(query.lessonId === undefined ? {} : { lessonId: query.lessonId }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const orderBy = [
      { updatedAt: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.AssignmentTemplateOrderByWithRelationInput[];

    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.assignmentTemplate.findMany(args),
      count: (filter) => this.prisma.assignmentTemplate.count({ where: filter }),
    });
  }

  /** Finds a template by ID, or returns null when it does not exist. */
  findById(id: string): Promise<AssignmentTemplate | null> {
    return this.prisma.assignmentTemplate.findUnique({ where: { id } });
  }

  /** Applies a patch only while the template retains the status already checked by the service. */
  async update(
    id: string,
    status: ContentStatus,
    body: UpdateAssignmentTemplateDto,
    blueprint?: AssignmentBlueprint,
  ): Promise<AssignmentTemplate | null> {
    const result = await this.prisma.assignmentTemplate.updateMany({
      where: { id, status },
      data: {
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(blueprint === undefined ? {} : { blueprint: toJsonInput(blueprint) }),
      },
    });
    return result.count === 0 ? null : this.findById(id);
  }

  /** Updates status only if it still matches the value read by the service. */
  async updateStatus(
    id: string,
    currentStatus: ContentStatus,
    status: ContentStatus,
  ): Promise<AssignmentTemplate | null> {
    const result = await this.prisma.assignmentTemplate.updateMany({
      where: { id, status: currentStatus },
      data: { status },
    });
    return result.count === 0 ? null : this.findById(id);
  }

  /** Deletes a template; foreign-key errors are left for the service to translate. */
  delete(id: string): Promise<{ id: string }> {
    return this.prisma.assignmentTemplate.delete({
      where: { id },
      select: { id: true },
    });
  }
}

/** Converts validated blueprint data to Prisma's JSON input type. */
function toJsonInput(blueprint: AssignmentBlueprint): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(blueprint)) as Prisma.InputJsonValue;
}
