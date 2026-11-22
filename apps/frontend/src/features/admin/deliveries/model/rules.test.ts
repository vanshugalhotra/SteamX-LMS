import { describe, expect, it } from 'vitest';
import { getDeliveryEnrollmentBlockReason, getPageAfterRemoval } from './rules';

describe('getDeliveryEnrollmentBlockReason', () => {
  it('requires an active delivery and subscription before enrollment', () => {
    expect(
      getDeliveryEnrollmentBlockReason({ status: 'INACTIVE', subscriptionActive: false }),
    ).toContain('delivery is inactive');
    expect(
      getDeliveryEnrollmentBlockReason({ status: 'ACTIVE', subscriptionActive: false }),
    ).toContain('subscription');
    expect(
      getDeliveryEnrollmentBlockReason({ status: 'ACTIVE', subscriptionActive: true }),
    ).toBeNull();
  });
});

describe('getPageAfterRemoval', () => {
  it('moves to the last available page when removing the final row', () => {
    expect(getPageAfterRemoval(2, 21, 20)).toBe(1);
    expect(getPageAfterRemoval(1, 21, 20)).toBe(1);
    expect(getPageAfterRemoval(2, 41, 20)).toBe(2);
  });
});
