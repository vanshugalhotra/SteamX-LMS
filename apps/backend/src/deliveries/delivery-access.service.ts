import { Injectable, NotFoundException } from '@nestjs/common';
import { UserType } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import { DeliveriesRepository } from './deliveries.repository.js';

/** Loads deliveries under the shared school and active-teacher visibility rule. */
@Injectable()
export class DeliveryAccessService {
  constructor(private readonly deliveries: DeliveriesRepository) {}

  /**
   * Loads the delivery in resolved school scope; school staff also need a current teacher assignment.
   * @param actor Authenticated actor.
   * @param deliveryId Requested delivery ID.
   * @returns The delivery if it is visible to the actor.
   * @throws NotFoundException when missing, outside school scope, or not assigned to the teacher.
   */
  async load(actor: AuthContext, deliveryId: string) {
    const scope = resolveSchoolScope(actor);
    const teacherId = actor.userType === UserType.SCHOOL_STAFF ? actor.userId : undefined;
    const delivery = await this.deliveries.findById(deliveryId, scope, teacherId);
    if (!delivery) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return delivery;
  }
}
