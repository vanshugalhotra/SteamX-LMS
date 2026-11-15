// Mirrors the backend subscription response and request DTOs.
export type SubscriptionStatus = 'UPCOMING' | 'ACTIVE' | 'EXPIRED';
export type SubscriptionStatusFilter = SubscriptionStatus | 'ALL';

export interface Subscription {
  id: string;
  schoolId: string;
  courseId: string;
  schoolName: string;
  courseTitle: string;
  startDate: string;
  endDate: string;
  maxDeliveries: number;
  createdAt: string;
  status: SubscriptionStatus;
  retainedUntil: string | null;
  activeDeliveries: number;
}

export interface SubscriptionListParams {
  page: number;
  limit: number;
  schoolId?: string;
  courseId?: string;
  status?: SubscriptionStatus;
}

export interface CreateSubscriptionPayload {
  schoolId: string;
  courseId: string;
  startDate: string;
  endDate: string;
  maxDeliveries: number;
}

export interface UpdateSubscriptionPayload {
  endDate?: string;
  maxDeliveries?: number;
}

export interface RenewSubscriptionPayload {
  endDate: string;
  startDate?: string;
  maxDeliveries?: number;
}
