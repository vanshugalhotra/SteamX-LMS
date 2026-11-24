import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDelivery,
  enrollDeliveryStudents,
  fetchDelivery,
  fetchDeliveryReleaseOutline,
  releaseDeliveryLesson,
  releaseDeliveryModule,
  unreleaseDeliveryLesson,
} from './api/api';
import type { Delivery, ReleaseOutlineResponse } from './model/types';
import {
  deliveryKeys,
  useCreateDelivery,
  useDelivery,
  useDeliveryReleaseOutline,
  useEnrollDeliveryStudents,
  useReleaseDeliveryLesson,
  useReleaseDeliveryModule,
  useUnreleaseDeliveryLesson,
} from './queries';

vi.mock('./api/api', () => ({
  createDelivery: vi.fn(),
  enrollDeliveryStudents: vi.fn(),
  fetchDeliveries: vi.fn(),
  fetchDelivery: vi.fn(),
  fetchDeliveryReleaseOutline: vi.fn(),
  releaseDeliveryLesson: vi.fn(),
  unreleaseDeliveryLesson: vi.fn(),
  releaseDeliveryModule: vi.fn(),
  updateDeliveryLabel: vi.fn(),
  updateDeliveryStatus: vi.fn(),
}));

const mockedCreateDelivery = vi.mocked(createDelivery);
const mockedEnrollDeliveryStudents = vi.mocked(enrollDeliveryStudents);
const mockedFetchDelivery = vi.mocked(fetchDelivery);
const mockedFetchDeliveryReleaseOutline = vi.mocked(fetchDeliveryReleaseOutline);
const mockedReleaseDeliveryLesson = vi.mocked(releaseDeliveryLesson);
const mockedUnreleaseDeliveryLesson = vi.mocked(unreleaseDeliveryLesson);
const mockedReleaseDeliveryModule = vi.mocked(releaseDeliveryModule);

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

const releaseOutlineResponse: ReleaseOutlineResponse = {
  modules: [
    {
      id: 'module-id',
      title: 'Module 1',
      position: 1,
      releaseState: 'NONE',
      releasedCount: 0,
      releasableLessonCount: 1,
      lessons: [
        {
          id: 'lesson-id',
          title: 'Lesson 1',
          position: 1,
          audience: 'STUDENT',
          released: false,
          releasedAt: null,
          releasable: true,
        },
      ],
    },
  ],
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

  it('fetches the release outline only for a supplied delivery ID', async () => {
    const { Wrapper } = createWrapper();
    const empty = renderHook(() => useDeliveryReleaseOutline(''), { wrapper: Wrapper });
    expect(empty.result.current.fetchStatus).toBe('idle');
    expect(mockedFetchDeliveryReleaseOutline).not.toHaveBeenCalled();

    mockedFetchDeliveryReleaseOutline.mockResolvedValue(releaseOutlineResponse);
    const { result } = renderHook(() => useDeliveryReleaseOutline('delivery-id'), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockedFetchDeliveryReleaseOutline).toHaveBeenCalledWith('delivery-id');
    expect(result.current.data?.modules).toHaveLength(1);
  });
});

describe('delivery mutations', () => {
  it('invalidates the delivery release outline after lesson and module mutations', async () => {
    mockedReleaseDeliveryLesson.mockResolvedValue({
      lessonId: 'lesson-id',
      released: true,
      releasedAt: '2026-11-24T16:00:00.000Z',
    });
    mockedUnreleaseDeliveryLesson.mockResolvedValue(undefined);
    mockedReleaseDeliveryModule.mockResolvedValue({
      moduleId: 'module-id',
      newlyReleased: 1,
      alreadyReleased: 0,
      skippedNotReleasable: 0,
    });

    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData(deliveryKeys.releaseOutline('delivery-id'), releaseOutlineResponse);
    queryClient.setQueryData(deliveryKeys.releaseOutline('other-delivery'), releaseOutlineResponse);
    const expectReleaseOutlineInvalidation = () => {
      expect(
        queryClient.getQueryState(deliveryKeys.releaseOutline('delivery-id'))?.isInvalidated,
      ).toBe(true);
      expect(
        queryClient.getQueryState(deliveryKeys.releaseOutline('other-delivery'))?.isInvalidated,
      ).toBe(false);
    };

    const releaseLesson = renderHook(() => useReleaseDeliveryLesson(), { wrapper: Wrapper });
    await act(async () => {
      await releaseLesson.result.current.mutateAsync({
        deliveryId: 'delivery-id',
        lessonId: 'lesson-id',
      });
    });
    expectReleaseOutlineInvalidation();

    queryClient.setQueryData(deliveryKeys.releaseOutline('delivery-id'), releaseOutlineResponse);
    queryClient.setQueryData(deliveryKeys.releaseOutline('other-delivery'), releaseOutlineResponse);
    const unreleaseLesson = renderHook(() => useUnreleaseDeliveryLesson(), { wrapper: Wrapper });
    await act(async () => {
      await unreleaseLesson.result.current.mutateAsync({
        deliveryId: 'delivery-id',
        lessonId: 'lesson-id',
      });
    });
    expectReleaseOutlineInvalidation();

    queryClient.setQueryData(deliveryKeys.releaseOutline('delivery-id'), releaseOutlineResponse);
    queryClient.setQueryData(deliveryKeys.releaseOutline('other-delivery'), releaseOutlineResponse);
    const releaseModule = renderHook(() => useReleaseDeliveryModule(), { wrapper: Wrapper });
    await act(async () => {
      await releaseModule.result.current.mutateAsync({
        deliveryId: 'delivery-id',
        moduleId: 'module-id',
      });
    });
    expectReleaseOutlineInvalidation();
  });

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

  it('invalidates enrollment lists for every status after enrolling or reactivating', async () => {
    mockedEnrollDeliveryStudents.mockResolvedValue({
      enrolled: 0,
      reactivated: 1,
      alreadyEnrolled: 0,
    });
    const { queryClient, Wrapper } = createWrapper();
    const activeParams = {
      deliveryId: 'delivery-id',
      page: 1,
      limit: 20,
      status: 'ACTIVE' as const,
    };
    const completedParams = {
      deliveryId: 'delivery-id',
      page: 2,
      limit: 20,
      status: 'COMPLETED' as const,
    };
    const otherDeliveryParams = {
      deliveryId: 'other-delivery',
      page: 1,
      limit: 20,
      status: 'ACTIVE' as const,
    };
    for (const params of [activeParams, completedParams, otherDeliveryParams]) {
      queryClient.setQueryData(deliveryKeys.enrollments(params), {
        items: [],
        page: params.page,
        limit: params.limit,
        total: 0,
      });
    }
    const { result } = renderHook(() => useEnrollDeliveryStudents(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        deliveryId: 'delivery-id',
        body: { studentIds: ['student-id'] },
      });
    });

    expect(queryClient.getQueryState(deliveryKeys.enrollments(activeParams))?.isInvalidated).toBe(
      true,
    );
    expect(
      queryClient.getQueryState(deliveryKeys.enrollments(completedParams))?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(deliveryKeys.enrollments(otherDeliveryParams))?.isInvalidated,
    ).toBe(false);
  });
});
