/** Applies assignment-template rules and maps repository records to API responses. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContentStatus } from '../../generated/prisma/client.js';
import { assertPlatformStaff } from '../../auth/assert-platform-staff.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { isForeignKeyViolation, throwNotFoundOnMissing } from '../../common/errors/prisma-error.js';
import { paginate } from '../../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { CourseModulesService } from '../../curriculum/course-modules/course-modules.service.js';
import { CoursesService } from '../../curriculum/courses/courses.service.js';
import { LessonsService } from '../../curriculum/lessons/lessons.service.js';
import { assertPublishableBlueprint } from '../blueprint/blueprint.validator.js';
import type {
  AssignmentTemplateListQueryDto,
  AssignmentTemplateResponseDto,
  AssignmentTemplateSummaryDto,
  CreateAssignmentTemplateDto,
  UpdateAssignmentTemplateDto,
} from './dto/assignment-template.dto.js';
import {
  toAssignmentTemplateResponse,
  readAssignmentBlueprint,
  toAssignmentTemplateSummary,
} from './assignment-templates.mapper.js';
import { AssignmentTemplatesRepository } from './assignment-templates.repository.js';
import { emptyBlueprint, normalizeBlueprint } from '../blueprint/blueprint-normalizer.js';

@Injectable()
export class AssignmentTemplatesService {
  constructor(
    private readonly templates: AssignmentTemplatesRepository,
    private readonly courses: CoursesService,
    private readonly modules: CourseModulesService,
    private readonly lessons: LessonsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AssignmentTemplatesService.name);
  }

  /** Creates a draft template after checking its course and optional anchor. */
  async create(
    actor: AuthContext,
    body: CreateAssignmentTemplateDto,
  ): Promise<AssignmentTemplateSummaryDto> {
    assertPlatformStaff(actor);
    await this.assertCourseAndAnchor(actor, body.courseId, body.moduleId, body.lessonId);
    const template = await this.templates.create(
      body,
      actor.userId,
      body.blueprint ? normalizeBlueprint(body.blueprint) : emptyBlueprint(),
    );
    this.logger.info(
      { actorId: actor.userId, templateId: template.id },
      'Assignment template created',
    );
    return toAssignmentTemplateSummary(template);
  }

  /** Lists template summaries; blueprint answer keys are never included. */
  async findMany(
    actor: AuthContext,
    query: AssignmentTemplateListQueryDto,
  ): Promise<PaginationResponseDto<AssignmentTemplateSummaryDto>> {
    assertPlatformStaff(actor);
    const { items, total } = await this.templates.findMany(query);
    return paginate(items.map(toAssignmentTemplateSummary), query.page, query.limit, total);
  }

  /** Returns full blueprint details to authorized platform administrators. */
  async findById(actor: AuthContext, id: string): Promise<AssignmentTemplateResponseDto> {
    assertPlatformStaff(actor);
    const template = await this.templates.findById(id);
    if (!template) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toAssignmentTemplateResponse(template);
  }

  /** Updates mutable fields and rechecks publish rules while the template is active. */
  async update(
    actor: AuthContext,
    id: string,
    body: UpdateAssignmentTemplateDto,
  ): Promise<AssignmentTemplateSummaryDto> {
    assertPlatformStaff(actor);
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }
    const current = await this.requireTemplate(id);
    if (current.status === ContentStatus.ARCHIVED) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_TEMPLATE_ARCHIVED);
    }
    const blueprint =
      body.blueprint === undefined
        ? readAssignmentBlueprint(current.blueprint)
        : normalizeBlueprint(body.blueprint);
    if (current.status === ContentStatus.ACTIVE) {
      assertPublishableBlueprint(blueprint);
    }
    const updated = await this.templates.update(
      id,
      current.status,
      body,
      body.blueprint ? blueprint : undefined,
    );
    if (!updated) {
      throw await this.updatedTemplateConflict(id);
    }
    this.logger.info({ actorId: actor.userId, templateId: id }, 'Assignment template updated');
    return toAssignmentTemplateSummary(updated);
  }

  /** Changes lifecycle status, checking publish rules whenever the target is active. */
  async updateStatus(
    actor: AuthContext,
    id: string,
    status: ContentStatus,
  ): Promise<AssignmentTemplateSummaryDto> {
    assertPlatformStaff(actor);
    const current = await this.requireTemplate(id);
    if (current.status === status) {
      return toAssignmentTemplateSummary(current);
    }
    if (status === ContentStatus.DRAFT) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_TEMPLATE_INVALID_STATUS_TRANSITION);
    }
    if (status === ContentStatus.ACTIVE) {
      assertPublishableBlueprint(readAssignmentBlueprint(current.blueprint));
    }
    const updated = await this.templates.updateStatus(id, current.status, status);
    if (!updated) {
      throw await this.updatedTemplateConflict(id);
    }
    this.logger.info(
      { actorId: actor.userId, templateId: id, oldStatus: current.status, newStatus: status },
      'Assignment template status changed',
    );
    return toAssignmentTemplateSummary(updated);
  }

  /** Deletes an unused template and translates references or missing IDs to API errors. */
  async delete(actor: AuthContext, id: string): Promise<void> {
    assertPlatformStaff(actor);
    try {
      const deleted = await this.templates.delete(id);
      this.logger.info(
        { actorId: actor.userId, templateId: deleted.id },
        'Assignment template deleted',
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(API_ERROR.RESOURCE_IN_USE);
      }
      throwNotFoundOnMissing(error);
      throw error;
    }
  }

  /** Ensures the course exists, is not archived, and owns any selected anchor. */
  private async assertCourseAndAnchor(
    actor: AuthContext,
    courseId: string,
    moduleId?: string,
    lessonId?: string,
  ): Promise<void> {
    const course = await this.courses.findById(actor, courseId);
    if (course.status === ContentStatus.ARCHIVED) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_TEMPLATE_COURSE_ARCHIVED);
    }
    if (moduleId !== undefined) {
      const module = await this.modules.findById(actor, moduleId);
      if (module.courseId !== courseId) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
    }
    if (lessonId !== undefined) {
      const lesson = await this.lessons.findById(actor, lessonId);
      if (lesson.courseId !== courseId) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
    }
  }

  /** Loads a template or returns the standard not-found response. */
  private async requireTemplate(id: string) {
    const template = await this.templates.findById(id);
    if (!template) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return template;
  }

  /** Resolves a failed compare-and-set as a missing record or transition conflict. */
  private async updatedTemplateConflict(
    id: string,
  ): Promise<ConflictException | NotFoundException> {
    const latest = await this.templates.findById(id);
    return latest
      ? new ConflictException(API_ERROR.ASSIGNMENT_TEMPLATE_INVALID_STATUS_TRANSITION)
      : new NotFoundException(API_ERROR.NOT_FOUND);
  }
}
