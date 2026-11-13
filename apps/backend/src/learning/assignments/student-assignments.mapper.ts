/** Maps explicitly selected assignment records to the student-safe API shapes. */
import { SubmissionStatus, type Prisma } from '../../generated/prisma/client.js';
import { gradeFromPercent, isLevelCode, type LevelCode } from '../../grading/grade-scale.js';
import { canSubmit, isLate, submissionState } from './assignment-student-rules.js';
import type {
  StudentAssignmentDetailResponseDto,
  StudentAssignmentSummaryDto,
} from './dto/student-assignment-response.dto.js';
import type {
  StudentAssignmentDetailRecord,
  StudentAssignmentListRecord,
  StudentSubmissionRecord,
} from '../../assignments/delivery/delivery-assignments.repository.js';

/** Converts list rows without exposing submission or assignment internals. */
export function toStudentAssignmentSummary(
  assignment: StudentAssignmentListRecord,
  now: Date,
): StudentAssignmentSummaryDto {
  const submission = assignment.submissionId
    ? {
        status: requireSubmissionStatus(assignment.submissionStatus),
        submittedAt: requireSubmittedAt(assignment.submittedAt),
        dueAtAtSubmission: assignment.dueAtAtSubmission,
      }
    : null;
  return {
    id: assignment.id,
    title: assignment.title,
    dueAt: assignment.dueAt,
    moduleId: assignment.moduleId,
    lessonId: assignment.lessonId,
    allowResubmission: assignment.allowResubmission,
    canSubmit: canSubmit(assignment, submission),
    submissionState: submissionState(submission),
    submittedAt: submission?.submittedAt ?? null,
    isLate: isLate(submission, assignment.dueAt, now),
    grade:
      assignment.gradePercent === null ? null : gradeFromPercent(Number(assignment.gradePercent)),
  };
}

/** Converts a detail record after the repository has scoped its only submission to the student. */
export function toStudentAssignmentDetail(
  assignment: StudentAssignmentDetailRecord,
  now: Date,
): StudentAssignmentDetailResponseDto {
  const submission = assignment.submissions[0] ?? null;
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    dueAt: assignment.dueAt,
    moduleId: assignment.moduleId,
    lessonId: assignment.lessonId,
    allowResubmission: assignment.allowResubmission,
    canSubmit: canSubmit(assignment, submission),
    isLate: isLate(submission, assignment.dueAt, now),
    rubric: rubricItems(assignment.rubric),
    items: assignment.items.map((item) => ({
      id: item.id,
      position: item.position,
      type: item.type,
      prompt: item.prompt,
      config: item.config,
      options: item.options.map(({ id, position, text }) => ({ id, position, text })),
    })),
    submission: submission === null ? null : toStudentSubmission(submission, assignment.dueAt, now),
  };
}

/** Maps an own submission to the established student-facing response shape. */
export function toStudentSubmission(
  submission: StudentSubmissionRecord,
  dueAt: Date | null,
  now: Date,
): NonNullable<StudentAssignmentDetailResponseDto['submission']> {
  return {
    state: submission.status,
    submittedAt: submission.submittedAt,
    isLate: isLate(submission, dueAt, now),
    answers: submission.answers.map(({ itemId, answerText, selectedOptionId }) => ({
      itemId,
      answerText,
      selectedOptionId,
    })),
    files: submission.files.map(({ id, itemId, filename, mimeType, sizeBytes }) => ({
      id,
      itemId,
      filename,
      mimeType,
      sizeBytes: Number(sizeBytes),
    })),
    grade:
      submission.gradePercent === null
        ? null
        : {
            ...gradeFromPercent(submission.gradePercent.toNumber()),
            rubricLevels: levelCodes(submission.rubricLevels),
            feedback: submission.overallFeedback,
            gradedAt: submission.gradedAt,
          },
  };
}

/** Parses the stored rubric into its documented student-facing fields. */
function rubricItems(
  value: Prisma.JsonValue | null,
): { name: string; description: string | null }[] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new Error('Expected assignment rubric to be an array.');
  }
  return value.map((entry) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== 'object') {
      throw new Error('Expected assignment rubric entry to be an object.');
    }
    const name = entry.name;
    const description = entry.description;
    if (
      typeof name !== 'string' ||
      (description !== undefined && description !== null && typeof description !== 'string')
    ) {
      throw new Error('Expected assignment rubric entry to contain a name and description.');
    }
    return { name, description: typeof description === 'string' ? description : null };
  });
}

/** Rejects an incomplete joined submission row rather than mapping invalid data. */
function requireSubmissionStatus(
  status: StudentAssignmentListRecord['submissionStatus'],
): SubmissionStatus {
  if (status === null) {
    throw new Error('Expected a status for the selected student submission.');
  }
  if (status !== SubmissionStatus.SUBMITTED && status !== SubmissionStatus.GRADED) {
    throw new Error('Unexpected student submission status.');
  }
  return status;
}

/** Rejects an incomplete joined submission row rather than mapping invalid data. */
function requireSubmittedAt(submittedAt: Date | null): Date {
  if (submittedAt === null) {
    throw new Error('Expected a submitted timestamp for the selected student submission.');
  }
  return submittedAt;
}

/** Validates the stored grade-scale codes before returning them to the student. */
function levelCodes(value: Prisma.JsonValue | null): LevelCode[] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new Error('Expected rubric levels to be an array.');
  }
  const levels = value.filter((level): level is string => typeof level === 'string');
  if (levels.length !== value.length || !levels.every(isLevelCode)) {
    throw new Error('Expected rubric levels to contain grade-scale codes.');
  }
  return levels;
}
