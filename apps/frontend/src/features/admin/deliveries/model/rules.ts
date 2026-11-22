import type { Delivery } from './types';

export function getDeliveryEnrollmentBlockReason(
  delivery: Pick<Delivery, 'status' | 'subscriptionActive'>,
) {
  if (delivery.status !== 'ACTIVE') {
    return 'This delivery is inactive, so students can’t be enrolled.';
  }
  if (!delivery.subscriptionActive) {
    return 'The school’s subscription for this course has ended, so students can’t be enrolled.';
  }
  return null;
}

export function getPageAfterRemoval(page: number, total: number, limit: number) {
  const pageCount = Math.max(1, Math.ceil((total - 1) / limit));
  return Math.min(page, pageCount);
}
