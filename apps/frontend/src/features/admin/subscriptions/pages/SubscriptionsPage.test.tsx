import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '../model/types';

const { useSubscriptionsMock, schoolSearchMock, useCoursesMock, useRevokeSubscriptionMock } =
  vi.hoisted(() => ({
    useSubscriptionsMock: vi.fn(),
    schoolSearchMock: vi.fn(),
    useCoursesMock: vi.fn(),
    useRevokeSubscriptionMock: vi.fn(),
  }));

vi.mock('../queries', () => ({
  useSubscriptions: useSubscriptionsMock,
  useRevokeSubscription: useRevokeSubscriptionMock,
}));
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));
vi.mock('@/features/admin/components/HeaderSlot', () => ({
  HeaderSlot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/admin/courses/queries', () => ({
  useCourses: useCoursesMock,
  useCourseSearch: () => ({
    options: [{ value: 'course-1', label: 'Robotics' }],
    isPending: false,
    isError: false,
  }),
}));
vi.mock('@/features/admin/schools/queries', () => ({
  useAnySchoolSearch: schoolSearchMock,
  useAnySchoolSearchWhenEnabled: schoolSearchMock,
}));

import { SubscriptionsPage } from './SubscriptionsPage';
import { PATHS } from '@/lib/paths';

const subscription: Subscription = {
  id: 'subscription-1',
  schoolId: 'school-1',
  courseId: 'course-1',
  schoolName: 'Greenfield School',
  courseTitle: 'Robotics',
  startDate: '2026-11-01',
  endDate: '2027-06-30',
  maxDeliveries: 4,
  createdAt: '2026-10-25T00:00:00.000Z',
  status: 'ACTIVE',
  retainedUntil: '2029-06-30',
  activeDeliveries: 2,
};

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    useSubscriptionsMock.mockReset().mockReturnValue({
      data: { items: [subscription], page: 1, limit: 6, total: 1 },
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });
    useCoursesMock.mockReset().mockReturnValue({
      data: { items: [{ id: 'course-1', title: 'Robotics' }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useRevokeSubscriptionMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    schoolSearchMock.mockReturnValue({
      options: [{ value: 'school-1', label: 'Greenfield School' }],
      isPending: false,
      isError: false,
    });
  });

  it('shows subscription terms, delivery usage, and lifecycle status', () => {
    render(
      <MemoryRouter>
        <SubscriptionsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Subscriptions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New subscription' })).toHaveAttribute(
      'href',
      PATHS.admin.subscriptionNew,
    );
    expect(screen.queryByText('Matching terms')).not.toBeInTheDocument();
    expect(screen.getByText('Greenfield School')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Robotics' })).toBeInTheDocument();
    expect(screen.getByText('1 Nov 2026 – 30 Jun 2027')).toBeInTheDocument();
    expect(screen.getByText(/2 of 4\s+deliveries/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Active deliveries used' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
    expect(screen.getByText('Active', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Renew' })).toHaveAttribute(
      'href',
      PATHS.admin.subscriptionRenew(subscription.id),
    );
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      PATHS.admin.subscriptionEdit(subscription.id),
    );
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
  });

  it('distinguishes an empty directory from an empty filtered result', async () => {
    const user = userEvent.setup();
    useSubscriptionsMock.mockReturnValue({
      data: { items: [], page: 1, limit: 6, total: 0 },
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SubscriptionsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No subscriptions yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => {
      expect(screen.getByText('No subscriptions match your filters.')).toBeInTheDocument();
    });
  });

  it('requests the selected status, school, and course filters', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SubscriptionsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Upcoming' }));
    await user.click(screen.getByRole('combobox', { name: 'Filter by school' }));
    await user.click(screen.getByRole('option', { name: 'Greenfield School' }));
    await user.click(screen.getByRole('button', { name: 'Robotics' }));

    await waitFor(() => {
      expect(useSubscriptionsMock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 6,
        schoolId: 'school-1',
        courseId: 'course-1',
        status: 'UPCOMING',
      });
    });
  });

  it('lets the header search select a course filter', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SubscriptionsPage />
      </MemoryRouter>,
    );

    await user.type(
      screen.getByRole('searchbox', { name: 'Search by course or school' }),
      'Robotics',
    );
    await user.click(
      within(screen.getByRole('list', { name: 'Course and school search results' })).getByRole(
        'button',
        { name: 'Robotics (Course)' },
      ),
    );

    await waitFor(() => {
      expect(useSubscriptionsMock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 6,
        schoolId: undefined,
        courseId: 'course-1',
        status: undefined,
      });
    });
  });
});
