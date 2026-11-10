/** Applies active-teacher visibility and release-equivalent write eligibility to assignments. */
import { ConflictException, Injectable } from '@nestjs/common';
import { DeliveryStatus } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { CourseAccessService } from '../../subscriptions/course-access.service.js';
import { DeliveryAccessService } from '../../deliveries/delivery-access.service.js';

/** Provides delivery lookup and write checks shared by assignment CRUD and publishing. */
@Injectable()
export class DeliveryAssignmentAccessService {
  constructor(
    private readonly deliveryAccess: DeliveryAccessService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  /** Loads a delivery after requiring an active teacher assignment, without subscription gating. */
  loadForRead(actor: AuthContext, deliveryId: string) {
    return this.deliveryAccess.load(actor, deliveryId);
  }

  /** Requires active teacher visibility, an ACTIVE delivery, and a current course subscription. */
  async loadForWrite(actor: AuthContext, deliveryId: string) {
    const delivery = await this.deliveryAccess.load(actor, deliveryId);
    await this.assertWriteEligibility(delivery);
    return delivery;
  }

  /** Requires an already-visible delivery to be active and have a current course subscription. */
  async assertWriteEligibility(delivery: {
    status: DeliveryStatus;
    schoolId: string;
    courseId: string;
  }): Promise<void> {
    if (delivery.status !== DeliveryStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.DELIVERY_NOT_ACTIVE);
    }
    await this.courseAccess.assertSubscriptionActive(delivery.schoolId, delivery.courseId);
  }
}
