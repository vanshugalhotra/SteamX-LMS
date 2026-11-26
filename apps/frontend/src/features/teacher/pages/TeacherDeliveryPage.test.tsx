import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiError } from '@/lib/api-client';
import { PATHS } from '@/lib/paths';
import type { Delivery, ReleaseOutlineResponse } from '@/features/deliveries/model/types';

const { useDeliveryMock, useDeliveryReleaseOutlineMock } = vi.hoisted(() => ({
  useDeliveryMock: vi.fn(),
  useDeliveryReleaseOutlineMock: vi.fn(),
}));

vi.mock('@/features/deliveries/queries', () => ({
  useDelivery: useDeliveryMock,
  useDeliveryReleaseOutline: useDeliveryReleaseOutlineMock,
}));

import { TeacherDeliveryPage } from './TeacherDeliveryPage';

const delivery: Delivery = {
  id: 'delivery-1',
  schoolId: 'school-1',
  course: { id: 'course-1', title: 'Science Grade 6' },
  label: 'Blue Class',
  academicYear: '2026-27',
  status: 'ACTIVE',
  displayName: 'Science Grade 6 - Blue Class - 2026-27',
  subscriptionActive: true,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};

const outline: ReleaseOutlineResponse = {
  modules: [
    {
      id: 'module-1',
      title: 'Plants and Energy',
      position: 1,
      releaseState: 'PARTIAL',
      releasedCount: 1,
      releasableLessonCount: 2,
      lessons: [
        {
          id: 'lesson-1',
          title: 'How plants make food',
          position: 1,
          audience: 'STUDENT',
          released: true,
          releasedAt: '2026-11-18T12:00:00.000Z',
          releasable: true,
        },
        {
          id: 'lesson-2',
          title: 'What plants need',
          position: 2,
          audience: 'STUDENT',
          released: false,
          releasedAt: null,
          releasable: true,
        },
        {
          id: 'lesson-3',
          title: 'Teacher lab notes',
          position: 3,
          audience: 'TEACHER_ONLY',
          released: false,
          releasedAt: null,
          releasable: false,
        },
      ],
    },
  ],
};

interface QueryResult<T> {
  data?: T;
  error?: unknown;
  isPending: boolean;
  refetch: ReturnType<typeof vi.fn>;
}

function mockDelivery(overrides: Partial<QueryResult<Delivery>> = {}) {
  const result: QueryResult<Delivery> = {
    data: delivery,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  };
  useDeliveryMock.mockReturnValue(result);
  return result;
}

function mockOutline(overrides: Partial<QueryResult<ReleaseOutlineResponse>> = {}) {
  const result: QueryResult<ReleaseOutlineResponse> = {
    data: outline,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  };
  useDeliveryReleaseOutlineMock.mockReturnValue(result);
  return result;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[PATHS.teacher.delivery('delivery-1')]}>
      <Routes>
        <Route path={PATHS.teacher.delivery(':id')} element={<TeacherDeliveryPage />} />
        <Route path={PATHS.teacher.deliveries} element={<p>My deliveries</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeacherDeliveryPage', () => {
  beforeEach(() => {
    useDeliveryMock.mockReset();
    useDeliveryReleaseOutlineMock.mockReset();
  });

  it('shows a loading state while the delivery details are loading', () => {
    mockDelivery({ data: undefined, isPending: true });
    mockOutline({ data: undefined, isPending: true });

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading delivery details');
  });

  it('shows delivery details, student progress, a read-only outline, and back navigation', async () => {
    mockDelivery();
    mockOutline();

    renderPage();

    expect(screen.getByRole('heading', { name: delivery.displayName })).toBeInTheDocument();
    expect(screen.getByText('Subscription active')).toBeInTheDocument();
    expect(screen.getByText('Plants and Energy')).toBeInTheDocument();
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 student lessons released')).toBeInTheDocument();
    expect(screen.getAllByText('Teacher only')).toHaveLength(2);
    const teacherOnlyRow = screen.getByText('Teacher lab notes').closest('li');
    if (!(teacherOnlyRow instanceof HTMLElement)) {
      throw new Error('Expected the teacher-only lesson row to be rendered.');
    }
    expect(within(teacherOnlyRow).queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Release module|Unrelease/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lessons in Plants and Energy' }),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Back to my deliveries' }));
    expect(screen.getByText('My deliveries')).toBeInTheDocument();
  });

  it('shows and expands modules and lessons returned by the release outline endpoint', async () => {
    const user = userEvent.setup();
    mockDelivery();
    mockOutline();
    renderPage();

    expect(screen.getByText('Plants and Energy')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 lessons released')).toBeInTheDocument();
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
    expect(screen.getByText('What plants need')).toBeInTheDocument();

    const moduleToggle = screen.getByRole('button', { name: 'Lessons in Plants and Energy' });
    await user.click(moduleToggle);
    expect(moduleToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('How plants make food')).not.toBeInTheDocument();

    await user.click(moduleToggle);
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
  });

  it('shows an empty state when the delivery has no active outline', () => {
    mockDelivery();
    mockOutline({ data: { modules: [] } });

    renderPage();

    expect(screen.getByText('No active modules available')).toBeInTheDocument();
  });

  it('allows retrying a failed request', async () => {
    const user = userEvent.setup();
    const deliveryRefetch = vi.fn();
    const outlineRefetch = vi.fn();
    mockDelivery({
      data: undefined,
      error: new ApiError(500, 'Request failed'),
      refetch: deliveryRefetch,
    });
    mockOutline({
      data: undefined,
      error: new ApiError(500, 'Request failed'),
      refetch: outlineRefetch,
    });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(deliveryRefetch).toHaveBeenCalledOnce();
    expect(outlineRefetch).toHaveBeenCalledOnce();
  });

  it('shows not found without a retry action for an out-of-scope delivery', () => {
    const notFound = new ApiError(404, 'Not found');
    mockDelivery({ data: undefined, error: notFound });
    mockOutline({ data: undefined, error: notFound });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Delivery not found.');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
