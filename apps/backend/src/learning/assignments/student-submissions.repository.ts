/** Persists student submissions and replaces answers atomically. */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '../../generated/prisma/client.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isSameSubmissionContent } from './submission-rules.js';
import type { NormalizedSubmissionAnswer } from './submission-rules.js';
import { computeMcqGrade } from './submission-rules.js';
import {
  STUDENT_SUBMISSION_SELECT,
  type StudentSubmissionRecord,
} from '../../assignments/delivery/delivery-assignments.repository.js';

/** Performs insert, idempotent retry, resubmission, and MCQ grading in one transaction. */
@Injectable()
export class StudentSubmissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Locks this student's row before applying replace semantics and returning its current state. */
  submit(input: {
    assignmentId: string;
    deliveryId: string;
    schoolId: string;
    studentId: string;
    answers: NormalizedSubmissionAnswer[];
    itemCount: number;
    isMcq: boolean;
  }): Promise<StudentSubmissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text AS id
        FROM submissions
        WHERE assignment_id = ${input.assignmentId}::uuid
          AND student_id = ${input.studentId}::uuid
        FOR UPDATE
      `);
      const assignment = await tx.assignment.findFirst({
        where: {
          id: input.assignmentId,
          deliveryId: input.deliveryId,
          status: 'PUBLISHED',
        },
        select: { allowResubmission: true },
      });
      if (!assignment) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }

      let submissionId: string;
      if (locked[0]) {
        submissionId = locked[0].id;
        const existing = await tx.submission.findUniqueOrThrow({
          where: { id: submissionId },
          select: {
            answers: { select: { itemId: true, answerText: true, selectedOptionId: true } },
          },
        });
        if (isSameSubmissionContent(existing.answers, input.answers)) {
          return tx.submission.findUniqueOrThrow({
            where: { id: submissionId },
            select: STUDENT_SUBMISSION_SELECT,
          });
        }
        if (!assignment.allowResubmission) {
          throw new ConflictException(API_ERROR.SUBMISSION_ALREADY_EXISTS);
        }

        await tx.submissionAnswer.deleteMany({ where: { submissionId } });
        await this.insertAnswers(tx, submissionId, input);
        await tx.submission.update({
          where: { id: submissionId },
          data: {
            submittedAt: new Date(),
            dueAtAtSubmission: null,
            status: SubmissionStatus.SUBMITTED,
            gradePercent: null,
            rubricLevels: Prisma.DbNull,
            overallFeedback: null,
            gradedById: null,
            gradedAt: null,
          },
        });
      } else {
        const submission = await tx.submission.create({
          data: {
            schoolId: input.schoolId,
            assignmentId: input.assignmentId,
            deliveryId: input.deliveryId,
            studentId: input.studentId,
          },
          select: { id: true },
        });
        submissionId = submission.id;
        await this.insertAnswers(tx, submissionId, input);
      }

      if (input.isMcq) {
        const [count] = await tx.$queryRaw<{ correct: number }[]>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE is_correct IS TRUE)::int AS correct
          FROM submission_answers
          WHERE submission_id = ${submissionId}::uuid
        `);
        const grade = computeMcqGrade(count?.correct ?? 0, input.itemCount);
        await tx.submission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.GRADED,
            gradePercent: grade.percent,
            gradedAt: new Date(),
            gradedById: null,
          },
        });
      }

      return tx.submission.findUniqueOrThrow({
        where: { id: submissionId },
        select: STUDENT_SUBMISSION_SELECT,
      });
    });
  }

  /** Inserts normalized student answers; the database computes MCQ correctness. */
  private insertAnswers(
    tx: Prisma.TransactionClient,
    submissionId: string,
    input: {
      assignmentId: string;
      schoolId: string;
      answers: NormalizedSubmissionAnswer[];
    },
  ): Promise<unknown> {
    return tx.submissionAnswer.createMany({
      data: input.answers.map((answer) => ({
        schoolId: input.schoolId,
        submissionId,
        assignmentId: input.assignmentId,
        itemId: answer.itemId,
        answerText: answer.answerText,
        selectedOptionId: answer.selectedOptionId,
      })),
    });
  }
}
