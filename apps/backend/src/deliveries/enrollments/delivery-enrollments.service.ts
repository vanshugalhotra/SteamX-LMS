import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  DeliveryStatus,
  EnrollmentStatus,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { paginate } from '../../common/pagination/paginate.js';
import { CourseAccessService } from '../../subscriptions/course-access.service.js';
import { DeliveryAccessService } from '../delivery-access.service.js';
import { toDeliveryEnrollmentResponse } from '../deliveries.mapper.js';
import { DeliveryEnrollmentsRepository } from './delivery-enrollments.repository.js';
import type { DeliveryEnrollmentListQueryDto } from './dto/delivery-enrollment-list-query.dto.js';
import { DeliveryEnrollmentListResponseDto } from './dto/delivery-enrollment-response.dto.js';
import type { EnrollmentCountsResponseDto } from './dto/enrollment-counts-response.dto.js';

/** Applies access, validation, and enrollment lifecycle rules for delivery students. */
@Injectable()
export class DeliveryEnrollmentsService {
  constructor(
    private readonly deliveryAccess: DeliveryAccessService,
    private readonly enrollments: DeliveryEnrollmentsRepository,
    private readonly courseAccess: CourseAccessService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryEnrollmentsService.name);
  }

  // ─────────────────────────────────────────
  // POST /deliveries/:id/enrollments — Enroll students
  // ─────────────────────────────────────────

  /**
   * Validates every requested student before atomically creating or reactivating enrollments.
   * @param actor Authenticated actor.
   * @param deliveryId Delivery to enroll students into.
   * @param studentIds Student IDs; duplicates are processed only once.
   * @returns Counts of new, reactivated, and already-active enrollments.
   * @throws NotFoundException when the delivery or a requested same-school student is missing.
   * @throws ConflictException when the delivery or any requested student is inactive.
   * @throws ForbiddenException when the delivery's course subscription is not current.
   */
  async enroll(
    actor: AuthContext,
    deliveryId: string,
    studentIds: string[],
  ): Promise<EnrollmentCountsResponseDto> {
    const delivery = await this.loadDelivery(actor, deliveryId);
    await this.assertEnrollmentWritesAllowed(delivery);
    const counts = await this.enrollStudents(delivery, [...new Set(studentIds)], actor.userId);
    this.logEnrollment(actor, delivery.id, delivery.schoolId, counts);
    return counts;
  }

  // ─────────────────────────────────────────
  // GET /deliveries/:id/enrollments — List enrollments
  // ─────────────────────────────────────────

  /**
   * Returns a paginated enrollment list for the delivery and requested status.
   * @param actor Authenticated actor.
   * @param deliveryId Delivery whose enrollments are requested.
   * @param query Status filter and pagination settings.
   * @returns The paginated enrollment response.
   */
  async findMany(
    actor: AuthContext,
    deliveryId: string,
    query: DeliveryEnrollmentListQueryDto,
  ): Promise<DeliveryEnrollmentListResponseDto> {
    const delivery = await this.loadDelivery(actor, deliveryId);
    const { items, total } = await this.enrollments.findMany(
      delivery.id,
      delivery.schoolId,
      query.status,
      query,
    );
    return paginate(items.map(toDeliveryEnrollmentResponse), query.page, query.limit, total);
  }

  // ─────────────────────────────────────────
  // DELETE /deliveries/:id/enrollments/:studentId — Remove an enrollment
  // ─────────────────────────────────────────

  /**
   * Removes an active enrollment; repeated removal is a successful no-op.
   * @param actor Authenticated actor.
   * @param deliveryId Delivery that owns the enrollment.
   * @param studentId Student whose enrollment is removed.
   * @throws NotFoundException when the delivery or enrollment is missing.
   * @throws ConflictException when the enrollment is completed.
   */
  async remove(actor: AuthContext, deliveryId: string, studentId: string): Promise<void> {
    const delivery = await this.loadDelivery(actor, deliveryId);
    const [removed] = await this.enrollments.removeActive(
      delivery.id,
      delivery.schoolId,
      studentId,
      actor.userId,
    );
    if (!removed) {
      const existing = await this.enrollments.findOne(delivery.id, delivery.schoolId, studentId);
      if (!existing) {
        throw new NotFoundException(API_ERROR.ENROLLMENT_NOT_FOUND);
      }
      if (existing.status === EnrollmentStatus.COMPLETED) {
        throw new ConflictException(API_ERROR.ENROLLMENT_NOT_ACTIVE);
      }
    }
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'remove',
        deliveryId: delivery.id,
        schoolId: delivery.schoolId,
      },
      'Delivery enrollment removed',
    );
  }

  // ─────────────────────────────────────────
  // Delivery access and transaction helpers
  // ─────────────────────────────────────────

  /**
   * Loads the delivery in actor scope and applies the active teacher-stint filter.
   * @param actor Authenticated actor.
   * @param deliveryId Requested delivery ID.
   * @returns The delivery if it is visible to the actor.
   * @throws NotFoundException when missing, outside school scope, or not assigned to the teacher.
   */
  private async loadDelivery(actor: AuthContext, deliveryId: string) {
    return this.deliveryAccess.load(actor, deliveryId);
  }

  /**
   * Requires an active delivery and current course subscription before enrollment writes.
   * @param delivery Delivery being written.
   * @throws ConflictException when the delivery is inactive.
   * @throws ForbiddenException when the course subscription is not current.
   */
  private async assertEnrollmentWritesAllowed(delivery: {
    id: string;
    schoolId: string;
    courseId: string;
    status: DeliveryStatus;
  }): Promise<void> {
    if (delivery.status !== DeliveryStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.DELIVERY_NOT_ACTIVE);
    }
    await this.courseAccess.assertSubscriptionActive(delivery.schoolId, delivery.courseId);
  }

  /**
   * Validates every requested profile in the delivery's school before writing enrollments.
   * Validation and enrollment writes share one transaction, so invalid input causes no partial writes.
   * @param delivery Delivery being enrolled.
   * @param studentIds Deduplicated student IDs.
   * @param actorId Authenticated actor ID used as enrollment owner.
   * @returns Counts of new, reactivated, and already-active enrollments.
   * @throws NotFoundException when any requested student profile is missing in the delivery's school.
   * @throws ConflictException when any student is inactive.
   */
  private async enrollStudents(
    delivery: { id: string; schoolId: string },
    studentIds: string[],
    actorId: string,
  ): Promise<EnrollmentCountsResponseDto> {
    return this.enrollments.transaction(async (tx) => {
      const students = await this.enrollments.findStudents(tx, delivery.schoolId, studentIds);
      const byId = new Map(students.map((student) => [student.userId, student]));
      const missingIds = studentIds.filter((studentId) => !byId.has(studentId));
      if (missingIds.length > 0) {
        throw new NotFoundException({
          ...API_ERROR.STUDENT_NOT_FOUND,
          details: { studentIds: missingIds },
        });
      }

      const inactiveIds = studentIds.filter(
        (studentId) => byId.get(studentId)?.user.status !== UserStatus.ACTIVE,
      );
      if (inactiveIds.length > 0) {
        throw new ConflictException({
          ...API_ERROR.STUDENT_NOT_ACTIVE,
          details: { studentIds: inactiveIds },
        });
      }

      return this.enrollStudentsInTransaction(tx, delivery, studentIds, actorId);
    });
  }

  /**
   * Creates missing rows, reactivates removed/completed rows, and counts active rows as unchanged.
   * @param tx Current transaction.
   * @param delivery Delivery being enrolled.
   * @param studentIds Validated student IDs.
   * @param actorId Authenticated actor ID used as enrollment owner.
   * @returns Counts of new, reactivated, and already-active enrollments.
   */
  private async enrollStudentsInTransaction(
    tx: Prisma.TransactionClient,
    delivery: { id: string; schoolId: string },
    studentIds: string[],
    actorId: string,
  ): Promise<EnrollmentCountsResponseDto> {
    if (studentIds.length === 0) {
      return { enrolled: 0, reactivated: 0, alreadyEnrolled: 0 };
    }

    const existing = await this.enrollments.findExisting(
      tx,
      delivery.id,
      delivery.schoolId,
      studentIds,
    );
    const existingByStudent = new Map(existing.map((row) => [row.studentId, row.status]));
    const newStudentIds = studentIds.filter((studentId) => !existingByStudent.has(studentId));
    const inactiveEnrollmentIds = studentIds.filter((studentId) => {
      const status = existingByStudent.get(studentId);
      return status === EnrollmentStatus.REMOVED || status === EnrollmentStatus.COMPLETED;
    });
    const enrolled =
      newStudentIds.length === 0
        ? 0
        : (
            await this.enrollments.createMany(
              tx,
              delivery.id,
              delivery.schoolId,
              newStudentIds,
              actorId,
            )
          ).count;
    const reactivated =
      inactiveEnrollmentIds.length === 0
        ? 0
        : (
            await this.enrollments.reactivateMany(
              tx,
              delivery.id,
              delivery.schoolId,
              inactiveEnrollmentIds,
              actorId,
            )
          ).count;
    return {
      enrolled,
      reactivated,
      alreadyEnrolled: studentIds.length - enrolled - reactivated,
    };
  }

  /**
   * Writes the structured summary for one enrollment request.
   * @param actor Authenticated actor.
   * @param deliveryId Delivery that was processed.
   * @param schoolId School that owns the delivery.
   * @param counts Enrollment result counts.
   */
  private logEnrollment(
    actor: AuthContext,
    deliveryId: string,
    schoolId: string,
    counts: EnrollmentCountsResponseDto,
  ): void {
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'enroll',
        deliveryId,
        schoolId,
        enrolled: counts.enrolled,
        reactivated: counts.reactivated,
        alreadyEnrolled: counts.alreadyEnrolled,
      },
      'Delivery enrollments processed',
    );
  }
}
