/** Applies teacher visibility, grade validation, stale checks, and response mapping. */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { paginate } from '../../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { toTeacherSubmissionDetail, toTeacherSubmissionListItem } from './grading.mapper.js';
import type { GradingQueryDto } from './dto/grading-query.dto.js';
import type { GradeSubmissionRequestDto } from './dto/grade-submission-request.dto.js';
import type {
  TeacherSubmissionDetailResponseDto,
  TeacherSubmissionListItemDto,
} from './dto/grading-response.dto.js';
import { DeliveryAssignmentAccessService } from '../delivery/delivery-assignment-access.service.js';
import { GradingRepository } from './grading.repository.js';
import {
  computeGrade,
  GRADE_MODE,
  resolveGradeMode,
  validateGradePayload,
} from './grading-rules.js';

/** Provides teacher-only submission review and grade replacement operations. */
@Injectable()
export class GradingService {
  constructor(
    private readonly access: DeliveryAssignmentAccessService,
    private readonly grading: GradingRepository,
  ) {}

  /** Lists active delivery enrollments and their state for one delivery assignment. */
  async findMany(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
    query: GradingQueryDto,
  ): Promise<PaginationResponseDto<TeacherSubmissionListItemDto>> {
    await this.access.loadForRead(actor, deliveryId);
    const page = await this.grading.findMany(deliveryId, assignmentId, query);
    if (!page) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    const now = new Date();
    return paginate(
      page.items.map((row) => toTeacherSubmissionListItem(row, page.dueAt, now)),
      query.page,
      query.limit,
      page.total,
    );
  }

  /** Reads one submission only when it belongs to the requested delivery assignment. */
  async findById(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
    submissionId: string,
  ): Promise<TeacherSubmissionDetailResponseDto> {
    await this.access.loadForRead(actor, deliveryId);
    const detail = await this.grading.findDetail(deliveryId, assignmentId, submissionId);
    if (!detail) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toTeacherSubmissionDetail(detail, new Date());
  }

  /** Validates and transactionally replaces an existing submission's teacher grade. */
  async grade(
    actor: AuthContext,
    deliveryId: string,
    assignmentId: string,
    submissionId: string,
    body: GradeSubmissionRequestDto,
  ): Promise<TeacherSubmissionDetailResponseDto> {
    const delivery = await this.access.loadForRead(actor, deliveryId);
    const current = await this.grading.findDetail(deliveryId, assignmentId, submissionId);
    if (!current) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    await this.access.assertWriteEligibility(delivery);
    const mode = resolveGradeMode(current.rubric, current.items);
    if (mode === GRADE_MODE.AUTO) {
      throw new ConflictException(API_ERROR.ASSIGNMENT_AUTO_GRADED);
    }
    const problems = validateGradePayload(
      mode,
      body,
      Array.isArray(current.rubric) ? current.rubric.length : 0,
    );
    const submittedAt = parseEchoedSubmittedAt(body.submittedAt);
    if (submittedAt === null) {
      problems.push({ field: 'submittedAt', rule: 'must_match_iso_timestamp_with_milliseconds' });
    }
    if (problems.length > 0 || submittedAt === null) {
      throw new UnprocessableEntityException({
        ...API_ERROR.SUBMISSION_GRADE_INVALID,
        details: problems,
      });
    }

    const grade = computeGrade(mode, body);
    const updated = await this.grading.grade({
      assignmentId,
      deliveryId,
      submissionId,
      submittedAt,
      teacherId: actor.userId,
      percent: grade.percent,
      rubricLevels: grade.rubricLevels,
      feedback: body.feedback?.trim() || null,
    });
    return toTeacherSubmissionDetail(updated, new Date());
  }
}

/** Accepts only the exact UTC millisecond timestamp emitted by the detail response. */
function parseEchoedSubmittedAt(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
}
