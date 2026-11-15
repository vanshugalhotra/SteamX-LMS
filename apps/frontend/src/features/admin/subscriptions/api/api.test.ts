import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import {
  buildSubscriptionListSearchParams,
  createSubscription,
  fetchSubscription,
  fetchSubscriptions,
  renewSubscription,
  revokeSubscription,
  updateSubscription,
} from './api';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('buildSubscriptionListSearchParams', () => {
  it('omits empty optional filters', () => {
    expect(buildSubscriptionListSearchParams({ page: 1, limit: 20 }).toString()).toBe(
      'page=1&limit=20',
    );
  });

  it('includes supported school, course, and status filters', () => {
    expect(
      buildSubscriptionListSearchParams({
        page: 2,
        limit: 10,
        schoolId: 'school-id',
        courseId: 'course-id',
        status: 'ACTIVE',
      }).toString(),
    ).toBe('page=2&limit=10&schoolId=school-id&courseId=course-id&status=ACTIVE');
  });
});

describe('subscription API functions', () => {
  it('fetches a paginated subscription list and a subscription detail', async () => {
    await fetchSubscriptions({ page: 1, limit: 20, status: 'UPCOMING' });
    await fetchSubscription('subscription-id');

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      '/subscriptions?page=1&limit=20&status=UPCOMING',
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(2, '/subscriptions/subscription-id');
  });

  it('sends create and update payloads to their endpoints', async () => {
    const createPayload = {
      schoolId: 'school-id',
      courseId: 'course-id',
      startDate: '2026-11-01',
      endDate: '2027-06-30',
      maxDeliveries: 4,
    };
    const updatePayload = { endDate: '2027-07-31', maxDeliveries: 5 };

    await createSubscription(createPayload);
    await updateSubscription('subscription-id', updatePayload);

    expect(mockedApiFetch).toHaveBeenNthCalledWith(1, '/subscriptions', {
      method: 'POST',
      body: JSON.stringify(createPayload),
    });
    expect(mockedApiFetch).toHaveBeenNthCalledWith(2, '/subscriptions/subscription-id', {
      method: 'PATCH',
      body: JSON.stringify(updatePayload),
    });
  });

  it('sends renew and revoke requests to their lifecycle endpoints', async () => {
    const renewPayload = { startDate: '2027-07-01', endDate: '2028-06-30' };

    await renewSubscription('subscription-id', renewPayload);
    await revokeSubscription('subscription-id');

    expect(mockedApiFetch).toHaveBeenNthCalledWith(1, '/subscriptions/subscription-id/renew', {
      method: 'POST',
      body: JSON.stringify(renewPayload),
    });
    expect(mockedApiFetch).toHaveBeenNthCalledWith(2, '/subscriptions/subscription-id/revoke', {
      method: 'POST',
    });
  });
});
