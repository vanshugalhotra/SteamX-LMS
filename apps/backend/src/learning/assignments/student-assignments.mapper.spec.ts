import { describe, expect, it } from 'vitest';
import { SubmissionStatus } from '../../generated/prisma/client.js';
import type { StudentAssignmentGradeRecord } from '../../assignments/delivery/delivery-assignments.repository.js';
import { toStudentAssignmentGrades } from './student-assignments.mapper.js';

describe('student assignment grade mapper', () => {
  const now = new Date('2026-01-20T12:00:00.000Z');

  it('averages each graded assignment equally and rounds the result once', () => {
    const response = toStudentAssignmentGrades(
      [gradeRecord('first', '91.25'), gradeRecord('second', '50')],
      now,
    );

    expect(response.average).toEqual({
      percent: 70.63,
      level: '3-',
      letter: 'B-',
      gradedCount: 2,
    });
    expect(response.items[0]?.grade).toMatchObject({
      percent: 91.25,
      level: '4',
      letter: 'A',
      rubricLevels: null,
      feedback: null,
    });
  });

  it('returns a null average when the student has no graded assignments', () => {
    expect(toStudentAssignmentGrades([], now)).toEqual({ average: null, items: [] });
  });
});

function gradeRecord(id: string, gradePercent: string): StudentAssignmentGradeRecord {
  return {
    id,
    title: `Assignment ${id}`,
    dueAt: new Date('2026-01-10T12:00:00.000Z'),
    moduleId: null,
    lessonId: null,
    allowResubmission: false,
    submissionStatus: SubmissionStatus.GRADED,
    submittedAt: new Date('2026-01-09T12:00:00.000Z'),
    dueAtAtSubmission: new Date('2026-01-10T12:00:00.000Z'),
    gradePercent,
    rubricLevels: null,
    overallFeedback: null,
    gradedAt: new Date('2026-01-11T12:00:00.000Z'),
  };
}
