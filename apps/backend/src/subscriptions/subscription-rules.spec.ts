import {
  calculateRetainedUntil,
  decideSubscriptionRevoke,
  deriveSubscriptionStatus,
  SubscriptionStatus,
} from './subscription-rules.js';

describe('subscription rules', () => {
  it.each([
    ['starts today', '2026-10-29', '2026-10-30', SubscriptionStatus.ACTIVE],
    ['ends today', '2026-10-28', '2026-10-29', SubscriptionStatus.ACTIVE],
    ['starts tomorrow', '2026-10-30', '2026-11-01', SubscriptionStatus.UPCOMING],
    ['ended yesterday', '2026-10-20', '2026-10-28', SubscriptionStatus.EXPIRED],
  ])('derives status when it %s', (_description, start, end, expected) => {
    expect(deriveSubscriptionStatus(start, end, '2026-10-29')).toBe(expected);
  });

  it.each([
    ['future start', '2026-10-30', '2026-11-30', { action: 'DELETE' }],
    ['start today', '2026-10-29', '2026-11-30', { action: 'DELETE' }],
    ['already started', '2026-10-28', '2026-11-30', { action: 'END', endDate: '2026-10-28' }],
    ['already ended', '2026-10-01', '2026-10-28', { action: 'REJECT' }],
  ])('decides revoke for a subscription with %s', (_description, start, end, expected) => {
    expect(decideSubscriptionRevoke(start, end, '2026-10-29')).toEqual(expected);
  });

  it('calculates retention from the latest end date plus two calendar years', () => {
    expect(calculateRetainedUntil('2027-06-30')).toBe('2029-06-30');
    expect(calculateRetainedUntil('2024-02-29')).toBe('2026-02-28');
    expect(calculateRetainedUntil(null)).toBeNull();
  });
});
