/** Maps explicitly selected assignment and submission data to teacher-safe response DTOs. */
import { Prisma, type SubmissionStatus } from '../../generated/prisma/client.js';
import { gradeFromPercent, isLevelCode, type LevelCode } from '../../grading/grade-scale.js';
import { isLate, submissionState } from '../../learning/assignments/assignment-student-rules.js';
import { toStudentSafeAssignmentItem } from '../../learning/assignments/student-assignments.mapper.js';
import type {
  TeacherSubmissionDetailResponseDto,
  TeacherSubmissionListItemDto,
} from './dto/grading-response.dto.js';
import type {
  TeacherAssignmentDetailRecord,
  TeacherSubmissionListRecord,
} from './grading.repository.js';

/** Maps one enrollment row and its optional submission into the paginated teacher list. */
export function toTeacherSubmissionListItem(
  row: TeacherSubmissionListRecord,
  dueAt: Date | null,
  now: Date,
): TeacherSubmissionListItemDto {
  const timing = row.submissionId
    ? {
        status: requireStatus(row.status),
        submittedAt: requireSubmittedAt(row.submittedAt),
        dueAtAtSubmission: row.dueAtAtSubmission,
      }
    : null;
  return {
    studentId: row.studentId,
    name: row.name,
    steamxId: row.steamxId,
    submissionId: row.submissionId,
    state: submissionState(timing),
    submittedAt: timing?.submittedAt.toISOString() ?? null,
    isLate: isLate(timing, dueAt, now),
    grade: row.gradePercent === null ? null : gradeFromPercent(row.gradePercent),
  };
}

/** Maps a scoped assignment detail record without revealing correctness or storage data. */
export function toTeacherSubmissionDetail(
  record: TeacherAssignmentDetailRecord,
  now: Date,
): TeacherSubmissionDetailResponseDto {
  const submission = record.submissions[0];
  if (!submission) {
    throw new Error('Expected the scoped assignment detail to include its submission.');
  }
  const user = submission.enrollment.student.user;
  return {
    student: { id: user.id, name: user.name, steamxId: user.steamxId },
    assignment: {
      id: record.id,
      title: record.title,
      dueAt: record.dueAt?.toISOString() ?? null,
      rubric: rubricItems(record.rubric),
      items: record.items.map(toStudentSafeAssignmentItem),
    },
    submission: {
      id: submission.id,
      state: submission.status,
      submittedAt: submission.submittedAt.toISOString(),
      isLate: isLate(
        {
          status: submission.status,
          submittedAt: submission.submittedAt,
          dueAtAtSubmission: submission.dueAtAtSubmission,
        },
        record.dueAt,
        now,
      ),
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
              gradedAt: requireGradedAt(submission.gradedAt).toISOString(),
              gradedBy:
                submission.gradedBy === null
                  ? null
                  : { id: submission.gradedBy.id, name: submission.gradedBy.name },
            },
    },
  };
}

/** Maps stored rubric JSON to its public name and description fields. */
function rubricItems(value: Prisma.JsonValue | null) {
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

/** Validates stored grade-level JSON before returning it to the teacher. */
function levelCodes(value: Prisma.JsonValue | null): LevelCode[] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || !value.every(isLevelCode)) {
    throw new Error('Expected rubric levels to contain grade-scale codes.');
  }
  return value;
}

/** Rejects an incomplete row returned by the optional submission join. */
function requireStatus(status: SubmissionStatus | null): SubmissionStatus {
  if (status === null) {
    throw new Error('Expected a status for the selected student submission.');
  }
  return status;
}

/** Rejects an incomplete row returned by the optional submission join. */
function requireSubmittedAt(submittedAt: Date | null): Date {
  if (submittedAt === null) {
    throw new Error('Expected a timestamp for the selected student submission.');
  }
  return submittedAt;
}

/** Enforces the database invariant that graded submissions have a timestamp. */
function requireGradedAt(gradedAt: Date | null): Date {
  if (gradedAt === null) {
    throw new Error('Expected a graded timestamp for a graded submission.');
  }
  return gradedAt;
}
