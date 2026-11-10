/** Builds assignment detail responses with current grouped counts. */
import type { DeliveryAssignmentResponseDto } from '../dto/delivery-assignment-response.dto.js';
import { toDeliveryAssignmentResponse } from './delivery-assignments.mapper.js';
import type {
  AssignmentDetailRecord,
  DeliveryAssignmentsRepository,
} from './delivery-assignments.repository.js';

/** Loads current submission counts and maps a delivery assignment detail response. */
export async function toDeliveryAssignmentDetailResponse(
  assignments: DeliveryAssignmentsRepository,
  assignment: AssignmentDetailRecord,
): Promise<DeliveryAssignmentResponseDto> {
  const counts = (await assignments.findCounts([assignment.id])).get(assignment.id)!;
  return toDeliveryAssignmentResponse(assignment, {
    ...counts,
    itemCount: assignment.items.length,
  });
}
