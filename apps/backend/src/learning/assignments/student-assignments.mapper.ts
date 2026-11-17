/** Maps explicitly selected assignment records to the student-safe API shapes. */
import { SubmissionStatus, type Prisma } from '../../generated/prisma/client.js';
import {
  averagePercent,
  gradeFromPercent,
  isLevelCode,
  type LevelCode,
} from '../../grading/grade-scale.js';
import {
  canSubmit,
  isLate,
  revealCorrectness,
  STUDENT_SUBMISSION_STATE,
  submissionState,
} from './assignment-student-rules.js';
import type {
  StudentAssignmentDetailSubmissionDto,
  StudentAssignmentDetailResponseDto,
  StudentAssignmentSubmissionDto,
  StudentAssignmentSummaryDto,
} from './dto/student-assignment-response.dto.js';
import type { StudentAssignmentGradesResponseDto } from './dto/student-assignment-grades-response.dto.js';
import type {
  StudentAssignmentDetailRecord,
  StudentAssignmentGradeRecord,
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
    items: assignment.items.map(toStudentSafeAssignmentItem),
    submission:
      submission === null
        ? null
        : toStudentSubmission(submission, assignment.dueAt, now, {
            reveal: revealCorrectness(assignment.allowResubmission, assignment.dueAt, now),
            singleChoiceItemIds: new Set(
              assignment.items.filter((item) => item.type === 'SINGLE_CHOICE').map(({ id }) => id),
            ),
          }),
  };
}

/** Maps an assignment item without exposing option correctness or other authoring fields. */
export function toStudentSafeAssignmentItem(item: StudentAssignmentDetailRecord['items'][number]) {
  return {
    id: item.id,
    position: item.position,
    type: item.type,
    prompt: item.prompt,
    config: item.config,
    options: item.options.map(({ id, position, text }) => ({ id, position, text })),
  };
}

type StudentAnswerCorrectness = {
  reveal: boolean;
  singleChoiceItemIds: ReadonlySet<string>;
};

/** Maps an own submission, adding correctness only for the assignment detail response. */
export function toStudentSubmission(
  submission: StudentSubmissionForMapping,
  dueAt: Date | null,
  now: Date,
  answerCorrectness: StudentAnswerCorrectness,
): NonNullable<StudentAssignmentDetailResponseDto['submission']>;
export function toStudentSubmission(
  submission: StudentSubmissionForMapping,
  dueAt: Date | null,
  now: Date,
): StudentAssignmentSubmissionDto;
export function toStudentSubmission(
  submission: StudentSubmissionForMapping,
  dueAt: Date | null,
  now: Date,
  answerCorrectness?: StudentAnswerCorrectness,
): StudentAssignmentSubmissionDto | StudentAssignmentDetailSubmissionDto {
  const common = {
    state: submission.status,
    submittedAt: submission.submittedAt,
    isLate: isLate(submission, dueAt, now),
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
        : toStudentDetailedGrade({
            gradePercent: submission.gradePercent.toNumber(),
            rubricLevels: submission.rubricLevels,
            overallFeedback: submission.overallFeedback,
            gradedAt: submission.gradedAt,
          }),
  };
  if (answerCorrectness === undefined) {
    return {
      ...common,
      answers: submission.answers.map(({ itemId, answerText, selectedOptionId }) => ({
        itemId,
        answerText,
        selectedOptionId,
      })),
    };
  }
  return {
    ...common,
    answers: submission.answers.map(({ itemId, answerText, selectedOptionId, isCorrect }) => ({
      itemId,
      answerText,
      selectedOptionId,
      isCorrect:
        submission.status === SubmissionStatus.GRADED &&
        answerCorrectness.reveal &&
        answerCorrectness.singleChoiceItemIds.has(itemId)
          ? (isCorrect ?? null)
          : null,
    })),
  };
}

/** Maps the stored grade fields consistently for detail and delivery grade-list responses. */
export function toStudentDetailedGrade(grade: StudentGradeFields) {
  if (grade.gradedAt === null) {
    throw new Error('Expected a graded timestamp for a graded submission.');
  }
  return {
    ...gradeFromPercent(
      typeof grade.gradePercent === 'number'
        ? grade.gradePercent
        : typeof grade.gradePercent === 'string'
          ? Number(grade.gradePercent)
          : grade.gradePercent.toNumber(),
    ),
    rubricLevels: levelCodes(grade.rubricLevels),
    feedback: grade.overallFeedback,
    gradedAt: grade.gradedAt,
  };
}

/** Maps all visible grades and computes an equal-weight average over this student's graded work. */
export function toStudentAssignmentGrades(
  records: StudentAssignmentGradeRecord[],
  now: Date,
): StudentAssignmentGradesResponseDto {
  const items = records.map((record) => {
    if (submissionState({ status: record.submissionStatus }) !== STUDENT_SUBMISSION_STATE.GRADED) {
      throw new Error('Expected only graded submissions in the student grades query.');
    }
    return {
      assignmentId: record.id,
      title: record.title,
      dueAt: record.dueAt,
      moduleId: record.moduleId,
      lessonId: record.lessonId,
      submittedAt: record.submittedAt,
      isLate: isLate(
        { submittedAt: record.submittedAt, dueAtAtSubmission: record.dueAtAtSubmission },
        record.dueAt,
        now,
      ),
      grade: toStudentDetailedGrade(record),
    };
  });
  const percent = averagePercent(items.map(({ grade }) => grade.percent));
  return {
    average: percent === null ? null : { ...gradeFromPercent(percent), gradedCount: items.length },
    items,
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

type StudentGradeFields = {
  gradePercent: number | string | { toNumber(): number };
  rubricLevels: Prisma.JsonValue | null;
  overallFeedback: string | null;
  gradedAt: Date | null;
};

type StudentSubmissionForMapping = Omit<StudentSubmissionRecord, 'answers'> & {
  answers: (StudentSubmissionRecord['answers'][number] & {
    isCorrect?: boolean | null;
  })[];
};
