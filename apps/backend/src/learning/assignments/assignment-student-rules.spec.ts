import { describe, expect, it } from 'vitest';
import { SubmissionStatus } from '../../generated/prisma/client.js';
import {
  canSubmit,
  isLate,
  STUDENT_SUBMISSION_STATE,
  submissionState,
} from './assignment-student-rules.js';

describe('student assignment rules', () => {
  const dueAt = new Date('2026-01-10T12:00:00.000Z');

  it('derives student submission state', () => {
    expect(submissionState(null)).toBe(STUDENT_SUBMISSION_STATE.NOT_SUBMITTED);
    expect(submissionState({ status: SubmissionStatus.SUBMITTED })).toBe(
      STUDENT_SUBMISSION_STATE.SUBMITTED,
    );
    expect(submissionState({ status: SubmissionStatus.GRADED })).toBe(
      STUDENT_SUBMISSION_STATE.GRADED,
    );
  });

  it('checks lateness against the submitted deadline snapshot', () => {
    expect(
      isLate(
        { submittedAt: dueAt, dueAtAtSubmission: dueAt },
        new Date('2027-01-10T12:00:00.000Z'),
        new Date(),
      ),
    ).toBe(false);
    expect(
      isLate(
        {
          submittedAt: new Date(dueAt.getTime() + 1),
          dueAtAtSubmission: dueAt,
        },
        dueAt,
        new Date(),
      ),
    ).toBe(true);
    expect(isLate(null, dueAt, new Date(dueAt.getTime() - 1))).toBe(false);
    expect(isLate(null, dueAt, new Date(dueAt.getTime() + 1))).toBe(true);
    expect(isLate({ submittedAt: new Date(), dueAtAtSubmission: null }, null, new Date())).toBe(
      false,
    );
    expect(isLate(null, null, new Date())).toBe(false);
  });

  it('allows submission when absent or resubmission is enabled', () => {
    const submission = {
      status: SubmissionStatus.SUBMITTED,
      submittedAt: dueAt,
      dueAtAtSubmission: dueAt,
    };
    expect(canSubmit({ allowResubmission: false }, null)).toBe(true);
    expect(canSubmit({ allowResubmission: false }, submission)).toBe(false);
    expect(canSubmit({ allowResubmission: true }, submission)).toBe(true);
    expect(
      canSubmit({ allowResubmission: false }, { ...submission, status: SubmissionStatus.GRADED }),
    ).toBe(false);
    expect(
      canSubmit({ allowResubmission: true }, { ...submission, status: SubmissionStatus.GRADED }),
    ).toBe(true);
  });
});
