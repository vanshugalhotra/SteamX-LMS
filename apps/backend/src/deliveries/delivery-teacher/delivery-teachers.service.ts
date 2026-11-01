import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, UserStatus } from '../../generated/prisma/client.js';
import { PinoLogger } from 'nestjs-pino';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { throwConflictOnDuplicate } from '../../common/errors/prisma-error.js';
import { paginate } from '../../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { resolveSchoolScope } from '../../common/tenancy/school-scope.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import type { CreateDeliveryTeacherDto } from '../dto/create-delivery-teacher.dto.js';
import type { DeliveryTeacherListQueryDto } from '../dto/delivery-teacher-list-query.dto.js';
import type { DeliveryTeacherResponseDto } from '../dto/delivery-teacher-response.dto.js';
import { toDeliveryTeacherResponse } from '../deliveries.mapper.js';
import { DeliveryTeachersRepository } from './delivery-teachers.repository.js';

/**
 * Assigns, removes, and lists delivery teachers without changing teacher profiles.
 */
@Injectable()
export class DeliveryTeachersService {
  constructor(
    private readonly deliveryTeachers: DeliveryTeachersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryTeachersService.name);
  }

  /**
   * Assigns an active teacher profile from the delivery's school to an active delivery.
   * @param actor Authenticated administrator.
   * @param deliveryId Delivery UUID.
   * @param body Teacher UUID.
   * @returns The newly created assignment.
   * @throws NotFoundException for a missing delivery or a teacher outside its school.
   * @throws ConflictException when the delivery or teacher is inactive, or the teacher is already assigned.
   */
  async assign(
    actor: AuthContext,
    deliveryId: string,
    body: CreateDeliveryTeacherDto,
  ): Promise<DeliveryTeacherResponseDto> {
    const scope = resolveSchoolScope(actor);
    const delivery = await this.deliveryTeachers.findForTeacherAssignment(deliveryId, scope);
    if (!delivery) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (delivery.status !== DeliveryStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.DELIVERY_NOT_ACTIVE);
    }

    const teacher = await this.deliveryTeachers.findTeacherStatus(
      body.teacherId,
      delivery.schoolId,
    );
    if (!teacher) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (teacher.user.status !== UserStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.TEACHER_NOT_ACTIVE);
    }

    try {
      const assignment = await this.deliveryTeachers.createTeacherAssignment({
        deliveryId,
        schoolId: delivery.schoolId,
        teacherId: body.teacherId,
        assignedById: actor.userId,
      });
      this.logger.info(
        {
          actorId: actor.userId,
          action: 'assign',
          deliveryId,
          teacherId: body.teacherId,
          schoolId: delivery.schoolId,
        },
        'Teacher assigned to delivery',
      );
      return toDeliveryTeacherResponse(assignment);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.TEACHER_ALREADY_ASSIGNED);
      throw error;
    }
  }

  /**
   * Ends the active assignment without deleting its history row.
   * @param actor Authenticated administrator.
   * @param deliveryId Delivery UUID.
   * @param teacherId Teacher UUID.
   * @returns Nothing when an active assignment was removed.
   * @throws NotFoundException when there is no active assignment in the caller's scope.
   */
  async remove(actor: AuthContext, deliveryId: string, teacherId: string): Promise<void> {
    const scope = resolveSchoolScope(actor);
    const [assignment] = await this.deliveryTeachers.removeActiveTeacherAssignment(
      deliveryId,
      teacherId,
      scope,
      actor.userId,
    );
    if (!assignment) {
      throw new NotFoundException(API_ERROR.TEACHER_NOT_ASSIGNED);
    }
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'remove',
        deliveryId,
        teacherId,
        schoolId: assignment.schoolId,
      },
      'Teacher removed from delivery',
    );
  }

  /**
   * Lists assignment history for an existing delivery, optionally including removed rows.
   * @param actor Authenticated administrator.
   * @param deliveryId Delivery UUID.
   * @param query Pagination and history options.
   * @returns A paginated newest-first assignment history.
   * @throws NotFoundException when the delivery is missing or out of scope.
   */
  async findMany(
    actor: AuthContext,
    deliveryId: string,
    query: DeliveryTeacherListQueryDto,
  ): Promise<PaginationResponseDto<DeliveryTeacherResponseDto>> {
    const scope = resolveSchoolScope(actor);
    const delivery = await this.deliveryTeachers.findForTeacherAssignment(deliveryId, scope);
    if (!delivery) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    const { items, total } = await this.deliveryTeachers.findTeacherAssignments(
      deliveryId,
      scope,
      query.includeRemoved,
      query,
    );
    return paginate(items.map(toDeliveryTeacherResponse), query.page, query.limit, total);
  }
}
