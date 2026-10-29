import type { SubscriptionRecord } from './subscriptions.repository.js';
import type { SubscriptionResponseDto } from './dto/subscription-response.dto.js';
import { calculateRetainedUntil, deriveSubscriptionStatus } from './subscription-rules.js';

export function toSubscriptionResponse(
  subscription: SubscriptionRecord,
  today: string,
  summary: { retainedUntil: string | null; activeDeliveries: number },
): SubscriptionResponseDto {
  return {
    id: subscription.id,
    schoolId: subscription.schoolId,
    courseId: subscription.courseId,
    schoolName: subscription.school.name,
    courseTitle: subscription.course.title,
    startDate: subscription.startDate.toISOString().slice(0, 10),
    endDate: subscription.endDate.toISOString().slice(0, 10),
    maxDeliveries: subscription.maxDeliveries,
    createdAt: subscription.createdAt,
    status: deriveSubscriptionStatus(
      subscription.startDate.toISOString().slice(0, 10),
      subscription.endDate.toISOString().slice(0, 10),
      today,
    ),
    retainedUntil: calculateRetainedUntil(summary.retainedUntil),
    activeDeliveries: summary.activeDeliveries,
  };
}
