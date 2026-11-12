/** Applies access, visibility, answer validation, and idempotent submission rules. */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ItemType } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
} from '../../common/errors/prisma-error.js';
import { LearningAccessService } from '../learning-access.service.js';
import { toStudentSubmission } from './student-assignments.mapper.js';
import type { StudentAssignmentSubmissionDto } from './dto/student-assignment-response.dto.js';
import type { StudentSubmissionRequestDto } from './dto/student-submission-request.dto.js';
import { validateSubmissionPayload } from './submission-rules.js';
import { StudentSubmissionsRepository } from './student-submissions.repository.js';
import { DeliveryAssignmentsService } from '../../assignments/delivery/delivery-assignments.service.js';

/** Submits and replaces a student's answers while preserving assignment read visibility. */
@Injectable()
export class StudentSubmissionsService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly assignments: DeliveryAssignmentsService,
    private readonly submissions: StudentSubmissionsRepository,
  ) {}

  /** Submits the complete answer set, retrying a first-submit unique race once. */
  async submit(
    auth: AuthContext,
    deliveryId: string,
    assignmentId: string,
    body: StudentSubmissionRequestDto,
  ): Promise<StudentAssignmentSubmissionDto> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const access = await this.access.assertDeliveryAccess(auth, deliveryId);
        if (access.studentId === undefined) {
          throw new ForbiddenException(API_ERROR.FORBIDDEN);
        }

        const assignment = await this.assignments.findStudentAssignmentById(
          access.deliveryId,
          access.studentId,
          assignmentId,
        );
        if (!assignment) {
          throw new NotFoundException(API_ERROR.NOT_FOUND);
        }
        if (assignment.items.some((item) => item.type === ItemType.FILE_UPLOAD)) {
          // TODO(ASG-6): Remove this guard when file submissions are implemented.
          throw new ConflictException(API_ERROR.SUBMISSION_FILES_NOT_SUPPORTED);
        }

        const validation = validateSubmissionPayload(assignment.items, body.answers);
        if (validation.problems.length > 0) {
          throw new UnprocessableEntityException({
            ...API_ERROR.SUBMISSION_INVALID,
            details: validation.problems,
          });
        }

        const submission = await this.submissions.submit({
          assignmentId,
          deliveryId: access.deliveryId,
          schoolId: access.schoolId,
          studentId: access.studentId,
          answers: validation.answers,
          itemCount: assignment.items.length,
          isMcq: assignment.items.every((item) => item.type === ItemType.SINGLE_CHOICE),
        });
        return toStudentSubmission(submission, assignment.dueAt, new Date());
      } catch (error) {
        if (attempt === 0 && isSubmissionUniqueViolation(error)) {
          continue;
        }
        if (isResubmissionDisabledViolation(error)) {
          throw new ConflictException(API_ERROR.SUBMISSION_ALREADY_EXISTS);
        }
        if (isSubmissionGuardViolation(error)) {
          throw new NotFoundException(API_ERROR.NOT_FOUND);
        }
        throw error;
      }
    }

    throw new Error('Submission retry loop exited unexpectedly.');
  }
}

function isSubmissionUniqueViolation(error: unknown): boolean {
  if (getPostgresCode(error) === '23505') {
    const reason = getPrismaReason(error).toLowerCase();
    return (
      reason.includes('submissions') && reason.includes('assignment') && reason.includes('student')
    );
  }
  if (!isPrismaKnownError(error) || error.code !== 'P2002') {
    return false;
  }
  const target = JSON.stringify(error.meta ?? '').toLowerCase();
  return target.includes('assignment') && target.includes('student');
}

function isResubmissionDisabledViolation(error: unknown): boolean {
  return (
    getPostgresCode(error) === '23000' &&
    collectErrorText(error).includes('assignment does not allow resubmission')
  );
}

function isSubmissionGuardViolation(error: unknown): boolean {
  const text = collectErrorText(error);
  return (
    getPostgresCode(error) === '23000' &&
    (text.includes('trg_submissions_validate_insert') ||
      text.includes('submissions require a published assignment') ||
      text.includes('submissions require an active enrollment') ||
      text.includes('submissions require current course access'))
  );
}

function collectErrorText(value: unknown, depth = 0): string {
  if (depth > 4 || value === null || typeof value !== 'object') {
    return '';
  }
  if (value instanceof Error) {
    return `${value.message} ${collectErrorText(value.cause, depth + 1)}`;
  }
  const record = value as Record<string, unknown>;
  const fields = [
    'message',
    'constraint',
    'detail',
    'cause',
    'driverAdapterError',
    'reason',
    'meta',
  ];
  return fields
    .map((field) => {
      const entry = record[field];
      return typeof entry === 'string' ? entry : collectErrorText(entry, depth + 1);
    })
    .join(' ')
    .toLowerCase();
}
