import { Injectable } from '@nestjs/common';
import { DeliveryStatus, Prisma, UserStatus } from '../../generated/prisma/client.js';
import { schoolFilter } from '../../common/tenancy/school-scope.js';
import { paginatedSearch } from '../../common/repositories/paginated-search.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const DELIVERY_TEACHER_SELECT = {
  id: true,
  teacherId: true,
  assignedAt: true,
  assignedById: true,
  removedAt: true,
  removedById: true,
  teacher: { select: { user: { select: { name: true, steamxId: true } } } },
  assignedBy: { select: { id: true, name: true } },
  removedBy: { select: { id: true, name: true } },
} satisfies Prisma.DeliveryTeacherSelect;

export type DeliveryTeacherRecord = Prisma.DeliveryTeacherGetPayload<{
  select: typeof DELIVERY_TEACHER_SELECT;
}>;

/** Owns delivery teacher assignment persistence and scoped lookups. */
@Injectable()
export class DeliveryTeachersRepository {
  /** Creates the repository with the shared Prisma client. */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a delivery's identity, school, and status for teacher assignment management.
   * @param id Delivery UUID.
   * @param scope Resolved school UUID, or undefined for platform-wide access.
   * @returns The delivery summary, or null when missing or out of scope.
   */
  findForTeacherAssignment(
    id: string,
    scope: string | undefined,
  ): Promise<{ id: string; schoolId: string; status: DeliveryStatus } | null> {
    return this.prisma.delivery.findFirst({
      where: { id, ...schoolFilter(scope) },
      select: { id: true, schoolId: true, status: true },
    });
  }

  /**
   * Looks up a teacher profile in the delivery's school and selects its account status.
   * The school predicate keeps teachers from other schools indistinguishable from missing teachers.
   * @param teacherId Teacher user UUID.
   * @param schoolId Delivery school UUID.
   * @returns The related account status, or null when no teacher profile exists in that school.
   */
  findTeacherStatus(
    teacherId: string,
    schoolId: string,
  ): Promise<{ user: { status: UserStatus } } | null> {
    return this.prisma.teacherProfile.findFirst({
      where: { userId: teacherId, schoolId },
      select: { user: { select: { status: true } } },
    });
  }

  /**
   * Creates a new teacher assignment record and selects its response fields.
   * @param data Delivery, school, teacher, and assigning actor IDs.
   * @returns The created assignment with teacher and actor display fields.
   */
  createTeacherAssignment(data: {
    deliveryId: string;
    schoolId: string;
    teacherId: string;
    assignedById: string;
  }): Promise<DeliveryTeacherRecord> {
    return this.prisma.deliveryTeacher.create({
      data,
      select: DELIVERY_TEACHER_SELECT,
    });
  }

  /**
   * Ends active assignment history in one update restricted to the delivery school scope.
   * @param deliveryId Delivery UUID.
   * @param teacherId Teacher UUID.
   * @param scope Resolved school UUID, or undefined for platform-wide access.
   * @param removedById Actor UUID recording the removal.
   * @returns School IDs of updated rows; empty when no active assignment matched.
   */
  removeActiveTeacherAssignment(
    deliveryId: string,
    teacherId: string,
    scope: string | undefined,
    removedById: string,
  ): Promise<{ schoolId: string }[]> {
    return this.prisma.deliveryTeacher.updateManyAndReturn({
      where: {
        deliveryId,
        teacherId,
        removedAt: null,
        ...schoolFilter(scope),
      },
      data: { removedAt: new Date(), removedById },
      select: { schoolId: true },
    });
  }

  /**
   * Lists assignments for one delivery in newest-first order, optionally including removed history.
   * @param deliveryId Delivery UUID.
   * @param scope Resolved school UUID, or undefined for platform-wide access.
   * @param includeRemoved Whether to include removed assignments.
   * @param pagination Requested page and limit.
   * @returns The matching assignment page and total count.
   */
  findTeacherAssignments(
    deliveryId: string,
    scope: string | undefined,
    includeRemoved: boolean,
    pagination: { page: number; limit: number },
  ): Promise<{ items: DeliveryTeacherRecord[]; total: number }> {
    const where: Prisma.DeliveryTeacherWhereInput = {
      deliveryId,
      ...schoolFilter(scope),
      ...(includeRemoved ? {} : { removedAt: null }),
    };
    const orderBy = [
      { assignedAt: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.DeliveryTeacherOrderByWithRelationInput[];
    return paginatedSearch({
      where,
      orderBy,
      page: pagination.page,
      limit: pagination.limit,
      findMany: (args) =>
        this.prisma.deliveryTeacher.findMany({ ...args, select: DELIVERY_TEACHER_SELECT }),
      count: (filter) => this.prisma.deliveryTeacher.count({ where: filter }),
    });
  }
}
