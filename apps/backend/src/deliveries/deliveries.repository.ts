import { Injectable } from '@nestjs/common';
import { ContentStatus, DeliveryStatus, Prisma, UserType } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { schoolFilter } from '../common/tenancy/school-scope.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import type { DeliveryListQueryDto } from './dto/delivery-list-query.dto.js';

const DELIVERY_SELECT = {
  id: true,
  schoolId: true,
  courseId: true,
  classSectionId: true,
  academicYear: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { id: true, title: true } },
  classSection: { select: { id: true, className: true, sectionName: true } },
} satisfies Prisma.DeliverySelect;

export type DeliveryRecord = Prisma.DeliveryGetPayload<{ select: typeof DELIVERY_SELECT }>;

/**
 * Owns delivery persistence and applies school/teacher filters directly in Prisma queries.
 * Database triggers enforce subscription and capacity rules on writes.
 */
@Injectable()
export class DeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------- Section and course lookups --------------------
  /**
   * Checks whether a class section belongs to the supplied school.
   * @param classSectionId Class section UUID.
   * @param schoolId School UUID.
   * @returns Whether the section exists in that school.
   */
  classSectionExistsInSchool(classSectionId: string, schoolId: string): Promise<boolean> {
    return this.prisma.classSection
      .findFirst({ where: { id: classSectionId, schoolId }, select: { id: true } })
      .then((section) => section !== null);
  }

  /**
   * Loads the course fields needed for delivery status validation.
   * @param courseId Course UUID.
   * @returns The course summary, or null when it does not exist.
   */
  findCourse(
    courseId: string,
  ): Promise<{ id: string; title: string; status: ContentStatus } | null> {
    return this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    });
  }

  // -------------------- Reads --------------------
  /**
   * Finds a paginated, school-scoped delivery list and filters school staff to their active assignments.
   * @param scope Resolved school UUID, or undefined for platform-wide access.
   * @param actor Authenticated actor used to apply teacher visibility.
   * @param query Delivery filters and pagination.
   * @returns The matching delivery page and total count.
   */
  findMany(
    scope: string | undefined,
    actor: AuthContext,
    query: DeliveryListQueryDto,
  ): Promise<{ items: DeliveryRecord[]; total: number }> {
    const where: Prisma.DeliveryWhereInput = {
      ...schoolFilter(scope),
      ...(query.courseId === undefined ? {} : { courseId: query.courseId }),
      ...(query.classSectionId === undefined ? {} : { classSectionId: query.classSectionId }),
      ...(query.academicYear === undefined ? {} : { academicYear: query.academicYear }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(actor.userType === UserType.SCHOOL_STAFF
        ? { teachers: { some: { teacherId: actor.userId, removedAt: null } } }
        : {}),
    };
    const orderBy = [
      { createdAt: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.DeliveryOrderByWithRelationInput[];
    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.delivery.findMany({ ...args, select: DELIVERY_SELECT }),
      count: (filter) => this.prisma.delivery.count({ where: filter }),
    });
  }

  /**
   * Finds one delivery under school scope and optional active-teacher visibility.
   * @param id Delivery UUID.
   * @param scope Resolved school UUID, or undefined for platform-wide access.
   * @param teacherId Optional teacher UUID requiring an active assignment.
   * @returns The delivery, or null when missing, out of scope, or not assigned.
   */
  findById(
    id: string,
    scope: string | undefined,
    teacherId?: string,
  ): Promise<DeliveryRecord | null> {
    return this.prisma.delivery.findFirst({
      where: {
        id,
        ...schoolFilter(scope),
        ...(teacherId === undefined ? {} : { teachers: { some: { teacherId, removedAt: null } } }),
      },
      select: DELIVERY_SELECT,
    });
  }

  // -------------------- Writes --------------------
  /**
   * Counts ACTIVE deliveries for a school-course pair.
   * @param schoolId School UUID.
   * @param courseId Course UUID.
   * @returns The number of active deliveries.
   */
  countActiveDeliveries(schoolId: string, courseId: string): Promise<number> {
    return this.prisma.delivery.count({
      where: {
        schoolId,
        courseId,
        status: DeliveryStatus.ACTIVE,
      },
    });
  }

  /**
   * Creates a delivery for a school.
   * @param data Delivery fields supplied by the caller.
   * @param schoolId Resolved school UUID.
   * @returns The created delivery record.
   */
  create(data: CreateDeliveryDto, schoolId: string): Promise<DeliveryRecord> {
    return this.prisma.delivery.create({
      data: {
        schoolId,
        courseId: data.courseId,
        classSectionId: data.classSectionId,
        academicYear: data.academicYear,
      },
      select: DELIVERY_SELECT,
    });
  }

  /**
   * Updates delivery status under school scope and reloads the updated record.
   * @param id Delivery UUID.
   * @param scope Resolved school UUID, or undefined for platform-wide access.
   * @param status Target status.
   * @returns The updated delivery, or null when missing or out of scope.
   */
  async updateStatus(
    id: string,
    scope: string | undefined,
    status: DeliveryStatus,
  ): Promise<DeliveryRecord | null> {
    const result = await this.prisma.delivery.updateMany({
      where: { id, ...schoolFilter(scope) },
      data: { status },
    });
    return result.count === 0 ? null : this.findById(id, scope);
  }
}
