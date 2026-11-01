import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma, UserStatus } from '../../generated/prisma/client.js';
import { paginatedSearch } from '../../common/repositories/paginated-search.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DeliveryEnrollmentListQueryDto } from './dto/delivery-enrollment-list-query.dto.js';

const ENROLLMENT_SELECT = {
  id: true,
  studentId: true,
  status: true,
  enrolledAt: true,
  endedAt: true,
  student: {
    select: {
      user: { select: { name: true, steamxId: true } },
      classSection: { select: { id: true, className: true, sectionName: true } },
    },
  },
  enrolledBy: { select: { id: true, name: true } },
  endedBy: { select: { id: true, name: true } },
} satisfies Prisma.DeliveryEnrollmentSelect;

export type DeliveryEnrollmentRecord = Prisma.DeliveryEnrollmentGetPayload<{
  select: typeof ENROLLMENT_SELECT;
}>;

/** Stores enrollment reads and writes for delivery enrollment workflows. */
@Injectable()
export class DeliveryEnrollmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs enrollment reads and writes in one database transaction.
   * @param operation Work to execute with the transaction-scoped Prisma client.
   * @returns The operation result.
   */
  transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(operation);
  }

  // -------------------- Student lookups --------------------
  /**
   * Loads requested student profiles in the delivery's school.
   * @param tx Current transaction.
   * @param schoolId School that owns the delivery.
   * @param studentIds Requested student IDs.
   * @returns Each matching profile, class, and account status.
   */
  findStudents(tx: Prisma.TransactionClient, schoolId: string, studentIds: string[]) {
    return tx.studentProfile.findMany({
      where: { userId: { in: studentIds }, schoolId },
      select: {
        userId: true,
        classSectionId: true,
        user: { select: { status: true } },
      },
    });
  }

  /**
   * Loads active students in a delivery's class.
   * @param tx Current transaction.
   * @param schoolId School that owns the delivery.
   * @param classSectionId Delivery class-section ID.
   * @returns The IDs of active students in the class.
   */
  findActiveStudentsInClass(
    tx: Prisma.TransactionClient,
    schoolId: string,
    classSectionId: string,
  ) {
    return tx.studentProfile.findMany({
      where: {
        schoolId,
        classSectionId,
        user: { status: UserStatus.ACTIVE },
      },
      select: { userId: true },
    });
  }

  // -------------------- Enrollment reads --------------------
  /**
   * Loads existing enrollment rows for requested students in one query.
   * @param tx Current transaction.
   * @param deliveryId Delivery ID.
   * @param schoolId School that owns the delivery.
   * @param studentIds Student IDs to look up.
   * @returns Each existing student's enrollment status.
   */
  findExisting(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    schoolId: string,
    studentIds: string[],
  ) {
    return tx.deliveryEnrollment.findMany({
      where: { deliveryId, schoolId, studentId: { in: studentIds } },
      select: { studentId: true, status: true },
    });
  }

  /**
   * Returns a paginated list of enrollments in newest-first order.
   * @param deliveryId Delivery ID.
   * @param schoolId School that owns the delivery.
   * @param status Optional enrollment status filter; omitted includes every status.
   * @param pagination Requested page and limit.
   * @returns Enrollment items and the matching total.
   */
  findMany(
    deliveryId: string,
    schoolId: string,
    status: EnrollmentStatus | undefined,
    pagination: DeliveryEnrollmentListQueryDto,
  ): Promise<{ items: DeliveryEnrollmentRecord[]; total: number }> {
    const where: Prisma.DeliveryEnrollmentWhereInput = {
      deliveryId,
      schoolId,
      ...(status === undefined ? {} : { status }),
    };
    const orderBy = [
      { enrolledAt: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.DeliveryEnrollmentOrderByWithRelationInput[];
    return paginatedSearch({
      where,
      orderBy,
      page: pagination.page,
      limit: pagination.limit,
      findMany: (args) =>
        this.prisma.deliveryEnrollment.findMany({ ...args, select: ENROLLMENT_SELECT }),
      count: (filter) => this.prisma.deliveryEnrollment.count({ where: filter }),
    });
  }

  /**
   * Finds an enrollment after the conditional removal update affects no rows.
   * @param deliveryId Delivery ID.
   * @param schoolId School that owns the delivery.
   * @param studentId Student ID.
   * @returns Current status, or null when no enrollment exists.
   */
  findOne(deliveryId: string, schoolId: string, studentId: string) {
    return this.prisma.deliveryEnrollment.findFirst({
      where: { deliveryId, schoolId, studentId },
      select: { status: true },
    });
  }

  // -------------------- Enrollment writes --------------------
  /**
   * Creates enrollment rows and safely skips rows inserted by a concurrent request.
   * @param tx Current transaction.
   * @param deliveryId Delivery ID.
   * @param schoolId School that owns the delivery.
   * @param studentIds Student IDs to enroll.
   * @param enrolledById Acting user ID.
   * @returns The number of rows created.
   */
  createMany(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    schoolId: string,
    studentIds: string[],
    enrolledById: string,
  ): Promise<{ count: number }> {
    return tx.deliveryEnrollment.createMany({
      data: studentIds.map((studentId) => ({
        deliveryId,
        schoolId,
        studentId,
        enrolledById,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Reactivates existing removed or completed rows without changing their IDs.
   * @param tx Current transaction.
   * @param deliveryId Delivery ID.
   * @param schoolId School that owns the delivery.
   * @param studentIds Student IDs to reactivate.
   * @param enrolledById Acting user ID.
   * @returns The number of rows reactivated.
   */
  reactivateMany(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    schoolId: string,
    studentIds: string[],
    enrolledById: string,
  ): Promise<{ count: number }> {
    return tx.deliveryEnrollment.updateMany({
      where: {
        deliveryId,
        schoolId,
        studentId: { in: studentIds },
        status: { in: [EnrollmentStatus.REMOVED, EnrollmentStatus.COMPLETED] },
      },
      data: {
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: new Date(),
        enrolledById,
        endedAt: null,
        endedById: null,
      },
    });
  }

  /**
   * Removes an active enrollment in one conditional update.
   * @param deliveryId Delivery ID.
   * @param schoolId School that owns the delivery.
   * @param studentId Student ID.
   * @param endedById Acting user ID.
   * @returns Updated row IDs, or an empty array when no active enrollment exists.
   */
  removeActive(
    deliveryId: string,
    schoolId: string,
    studentId: string,
    endedById: string,
  ): Promise<{ id: string }[]> {
    return this.prisma.deliveryEnrollment.updateManyAndReturn({
      where: {
        deliveryId,
        schoolId,
        studentId,
        status: EnrollmentStatus.ACTIVE,
      },
      data: {
        status: EnrollmentStatus.REMOVED,
        endedAt: new Date(),
        endedById,
      },
      select: { id: true },
    });
  }
}
