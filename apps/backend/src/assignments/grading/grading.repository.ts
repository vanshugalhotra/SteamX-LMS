/** Reads delivery submissions and performs locked grade replacements with explicit selects. */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '../../generated/prisma/client.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { StudentSubmissionState } from '../../learning/assignments/assignment-student-rules.js';
import type { LevelCode } from '../../grading/grade-scale.js';

const REVIEW_SUBMISSION_SELECT = {
  id: true,
  studentId: true,
  status: true,
  submittedAt: true,
  dueAtAtSubmission: true,
  gradePercent: true,
  rubricLevels: true,
  overallFeedback: true,
  gradedAt: true,
  gradedBy: { select: { id: true, name: true } },
  enrollment: {
    select: {
      student: {
        select: {
          user: { select: { id: true, name: true, steamxId: true } },
        },
      },
    },
  },
  answers: {
    orderBy: [{ itemId: 'asc' }],
    select: { itemId: true, answerText: true, selectedOptionId: true },
  },
  files: {
    orderBy: [{ id: 'asc' }],
    select: { id: true, itemId: true, filename: true, mimeType: true, sizeBytes: true },
  },
} satisfies Prisma.SubmissionSelect;

/** Selects assignment content and one related submission without authoring-only fields. */
function assignmentDetailSelect(submissionId: string) {
  return {
    id: true,
    title: true,
    dueAt: true,
    rubric: true,
    items: {
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        position: true,
        type: true,
        prompt: true,
        config: true,
        options: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, position: true, text: true },
        },
      },
    },
    submissions: {
      where: { id: submissionId },
      select: REVIEW_SUBMISSION_SELECT,
    },
  } satisfies Prisma.AssignmentSelect;
}

export type TeacherAssignmentDetailRecord = Prisma.AssignmentGetPayload<{
  select: ReturnType<typeof assignmentDetailSelect>;
}>;

export type TeacherSubmissionListRecord = {
  studentId: string;
  name: string;
  steamxId: string;
  submissionId: string | null;
  status: SubmissionStatus | null;
  submittedAt: Date | null;
  dueAtAtSubmission: Date | null;
  gradePercent: number | null;
};

/** Provides delivery-scoped list, detail, and transactional grade persistence. */
@Injectable()
export class GradingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists active enrollments and their assignment submission in one query, with one count query. */
  async findMany(
    deliveryId: string,
    assignmentId: string,
    query: { page: number; limit: number; state?: StudentSubmissionState },
  ): Promise<{ items: TeacherSubmissionListRecord[]; total: number; dueAt: Date | null } | null> {
    const stateFilter = listStateFilter(query.state);
    const countFilter = listCountFilter(query.state);
    const rows = await this.prisma.$queryRaw<TeacherSubmissionListRecord[]>(Prisma.sql`
      SELECT
        u.id::text AS "studentId",
        u.name AS "name",
        u.steamx_id AS "steamxId",
        s.id::text AS "submissionId",
        s.status AS "status",
        s.submitted_at AS "submittedAt",
        s.due_at_at_submission AS "dueAtAtSubmission",
        s.grade_percent::float8 AS "gradePercent"
      FROM assignments a
      JOIN delivery_enrollments e ON e.delivery_id = a.delivery_id AND e.status = 'ACTIVE'
      JOIN student_profiles sp ON sp.user_id = e.student_id AND sp.school_id = e.school_id
      JOIN users u ON u.id = sp.user_id AND u.user_type = 'STUDENT'
      LEFT JOIN submissions s ON s.assignment_id = a.id
        AND s.student_id = e.student_id
      WHERE a.id = ${assignmentId}::uuid
        AND a.delivery_id = ${deliveryId}::uuid
        ${stateFilter}
      ORDER BY u.name ASC, u.id ASC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `);
    const [count] = await this.prisma.$queryRaw<{ total: number; dueAt: Date | null }[]>(
      Prisma.sql`
      SELECT
        COUNT(e.student_id) FILTER (WHERE ${countFilter})::int AS total,
        a.due_at AS "dueAt"
      FROM assignments a
      LEFT JOIN delivery_enrollments e
        ON e.delivery_id = a.delivery_id AND e.status = 'ACTIVE'
      LEFT JOIN student_profiles sp ON sp.user_id = e.student_id AND sp.school_id = e.school_id
      LEFT JOIN users u ON u.id = sp.user_id AND u.user_type = 'STUDENT'
      LEFT JOIN submissions s ON s.assignment_id = a.id
        AND s.student_id = e.student_id
      WHERE a.id = ${assignmentId}::uuid
        AND a.delivery_id = ${deliveryId}::uuid
      GROUP BY a.due_at
    `,
    );
    if (!count) {
      return null;
    }
    return { items: rows, total: count.total, dueAt: count.dueAt };
  }

  /** Reads the target submission only when both delivery assignment and submission IDs match. */
  findDetail(
    deliveryId: string,
    assignmentId: string,
    submissionId: string,
  ): Promise<TeacherAssignmentDetailRecord | null> {
    return this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        deliveryId,
        submissions: { some: { id: submissionId } },
      },
      select: assignmentDetailSelect(submissionId),
    });
  }

  /** Serializes grade writes with student resubmits and checks the exact echoed millisecond. */
  grade(input: {
    assignmentId: string;
    deliveryId: string;
    submissionId: string;
    submittedAt: Date;
    teacherId: string;
    percent: number;
    rubricLevels: LevelCode[] | null;
    feedback: string | null;
  }): Promise<TeacherAssignmentDetailRecord> {
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string; submittedAt: Date }[]>(Prisma.sql`
        SELECT id::text AS id, submitted_at AS "submittedAt"
        FROM submissions
        WHERE id = ${input.submissionId}::uuid
          AND assignment_id = ${input.assignmentId}::uuid
        FOR UPDATE
      `);
      if (!locked) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      if (locked.submittedAt.getTime() !== input.submittedAt.getTime()) {
        throw new ConflictException(API_ERROR.SUBMISSION_CHANGED);
      }

      await tx.submission.update({
        where: { id: input.submissionId },
        data: {
          status: SubmissionStatus.GRADED,
          gradePercent: input.percent,
          rubricLevels: input.rubricLevels === null ? Prisma.DbNull : input.rubricLevels,
          overallFeedback: input.feedback,
          gradedById: input.teacherId,
          gradedAt: new Date(),
        },
        select: { id: true },
      });
      const detail = await tx.assignment.findFirst({
        where: { id: input.assignmentId, deliveryId: input.deliveryId },
        select: assignmentDetailSelect(input.submissionId),
      });
      if (!detail || detail.submissions.length === 0) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      return detail;
    });
  }
}

/** Returns the SQL predicate used to filter page rows by submission state. */
function listStateFilter(state?: StudentSubmissionState) {
  if (state === 'NOT_SUBMITTED') {
    return Prisma.sql`AND s.id IS NULL`;
  }
  if (state === SubmissionStatus.SUBMITTED) {
    return Prisma.sql`AND s.status = ${SubmissionStatus.SUBMITTED}`;
  }
  if (state === SubmissionStatus.GRADED) {
    return Prisma.sql`AND s.status = ${SubmissionStatus.GRADED}`;
  }
  return Prisma.empty;
}

/** Returns the matching status predicate used inside the total-count aggregate. */
function listCountFilter(state?: StudentSubmissionState) {
  if (state === 'NOT_SUBMITTED') {
    return Prisma.sql`s.id IS NULL`;
  }
  if (state === SubmissionStatus.SUBMITTED) {
    return Prisma.sql`s.status = ${SubmissionStatus.SUBMITTED}`;
  }
  if (state === SubmissionStatus.GRADED) {
    return Prisma.sql`s.status = ${SubmissionStatus.GRADED}`;
  }
  return Prisma.sql`TRUE`;
}
