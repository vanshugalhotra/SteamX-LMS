import type { DeliveryRecord } from './deliveries.repository.js';
import type { DeliveryResponseDto } from './dto/delivery-response.dto.js';

/**
 * Builds the delivery response, including a display name and subscription-state snapshot.
 * @param delivery Stored delivery and selected course/class-section fields.
 * @param subscriptionActive Current access state for this school-course pair.
 * @returns The public delivery response.
 */
export function toDeliveryResponse(
  delivery: DeliveryRecord,
  subscriptionActive: boolean,
): DeliveryResponseDto {
  return {
    id: delivery.id,
    schoolId: delivery.schoolId,
    course: delivery.course,
    classSection: delivery.classSection,
    academicYear: delivery.academicYear,
    status: delivery.status,
    displayName: `${delivery.course.title} - ${delivery.classSection.className} ${delivery.classSection.sectionName} - ${delivery.academicYear}`,
    subscriptionActive,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}
