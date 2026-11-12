/** Pure student assignment state rules shared by read and submission workflows. */
import { SubmissionStatus } from '../../generated/prisma/client.js';

export const STUDENT_SUBMISSION_STATE = {
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  SUBMITTED: SubmissionStatus.SUBMITTED,
  GRADED: SubmissionStatus.GRADED,
} as const;

export type StudentSubmissionState =
  (typeof STUDENT_SUBMISSION_STATE)[keyof typeof STUDENT_SUBMISSION_STATE];

export type StudentSubmissionTiming = {
  status?: SubmissionStatus;
  submittedAt: Date;
  dueAtAtSubmission: Date | null;
};

/** Returns the student-facing state for an assignment submission. */
export function submissionState(
  submission: Pick<StudentSubmissionTiming, 'status'> | null,
): StudentSubmissionState {
  if (!submission) {
    return STUDENT_SUBMISSION_STATE.NOT_SUBMITTED;
  }
  return submission.status === SubmissionStatus.GRADED
    ? STUDENT_SUBMISSION_STATE.GRADED
    : STUDENT_SUBMISSION_STATE.SUBMITTED;
}

/** Checks lateness against the due-date snapshot, or predicts lateness for a new submission. */
export function isLate(
  submission: StudentSubmissionTiming | null,
  dueAt: Date | null,
  now: Date,
): boolean {
  if (submission) {
    return (
      submission.dueAtAtSubmission !== null && submission.submittedAt > submission.dueAtAtSubmission
    );
  }
  return dueAt !== null && now > dueAt;
}

/** A student may submit again only when no submission exists or resubmission is enabled. */
export function canSubmit(
  assignment: { allowResubmission: boolean },
  submission: StudentSubmissionTiming | null,
): boolean {
  return submission === null || assignment.allowResubmission;
}
