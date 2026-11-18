import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDelivery, fetchDelivery } from './api/api';
import type { Delivery } from './model/types';
import { deliveryKeys, useCreateDelivery, useDelivery } from './queries';

vi.mock('./api/api', () => ({
  createDelivery: vi.fn(),
  fetchDeliveries: vi.fn(),
  fetchDelivery: vi.fn(),
  updateDeliveryLabel: vi.fn(),
  updateDeliveryStatus: vi.fn(),
}));

const mockedCreateDelivery = vi.mocked(createDelivery);
const mockedFetchDelivery = vi.mocked(fetchDelivery);

const deliveryResponse: Delivery = {
  id: 'delivery-id',
  schoolId: 'school-id',
  course: { id: 'course-id', title: 'Robotics' },
  label: 'Grade 5 Blue',
  academicYear: '2026-27',
  status: 'ACTIVE',
  displayName: 'Robotics - Grade 5 Blue - 2026-27',
  subscriptionActive: true,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

function seedDeliveryQueries(queryClient: QueryClient) {
  queryClient.setQueryData(deliveryKeys.list({ page: 1, limit: 20 }), {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  });
  queryClient.setQueryData(deliveryKeys.detail('delivery-id'), deliveryResponse);
}

function expectDeliveryQueriesInvalidated(queryClient: QueryClient) {
  expect(queryClient.getQueryState(deliveryKeys.list({ page: 1, limit: 20 }))?.isInvalidated).toBe(
    true,
  );
  expect(queryClient.getQueryState(deliveryKeys.detail('delivery-id'))?.isInvalidated).toBe(true);
}

beforeEach(() => vi.resetAllMocks());

describe('delivery queries', () => {
  it('fetches details only when an ID is supplied', async () => {
    const { Wrapper } = createWrapper();
    const empty = renderHook(() => useDelivery(''), { wrapper: Wrapper });

    expect(empty.result.current.fetchStatus).toBe('idle');
    expect(mockedFetchDelivery).not.toHaveBeenCalled();
    mockedFetchDelivery.mockResolvedValue(deliveryResponse);
    const { result } = renderHook(() => useDelivery('delivery-id'), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedFetchDelivery).toHaveBeenCalledWith('delivery-id');
    expect(result.current.data?.id).toBe('delivery-id');
  });
});

describe('delivery mutations', () => {
  it('invalidates list and detail queries after creating a delivery', async () => {
    mockedCreateDelivery.mockResolvedValue(deliveryResponse);
    const { queryClient, Wrapper } = createWrapper();
    seedDeliveryQueries(queryClient);
    const { result } = renderHook(() => useCreateDelivery(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        schoolId: 'school-id',
        courseId: 'course-id',
        academicYear: '2026-27',
        label: 'Grade 5 Blue',
      });
    });

    expectDeliveryQueriesInvalidated(queryClient);
  });
});
