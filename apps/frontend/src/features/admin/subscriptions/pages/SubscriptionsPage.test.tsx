import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '../model/types';

const { useSubscriptionsMock, schoolSearchMock, courseSearchMock } = vi.hoisted(() => ({
  useSubscriptionsMock: vi.fn(),
  schoolSearchMock: vi.fn(),
  courseSearchMock: vi.fn(),
}));

vi.mock('../queries', () => ({
  useSubscriptions: useSubscriptionsMock,
  useSubscriptionCourseSearch: courseSearchMock,
}));
vi.mock('@/features/admin/schools/queries', () => ({
  useAnySchoolSearch: schoolSearchMock,
}));

import { SubscriptionsPage } from './SubscriptionsPage';

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
      data: { items: [subscription], page: 1, limit: 10, total: 1 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    schoolSearchMock.mockReturnValue({
      options: [{ value: 'school-1', label: 'Greenfield School' }],
      isPending: false,
      isError: false,
    });
    courseSearchMock.mockReturnValue({
      options: [{ value: 'course-1', label: 'Robotics' }],
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
    expect(screen.getByText('Greenfield School')).toBeInTheDocument();
    expect(screen.getByText('Robotics')).toBeInTheDocument();
    expect(screen.getByText('1 Nov 2026 – 30 Jun 2027')).toBeInTheDocument();
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    expect(screen.getByText('Active', { selector: 'span' })).toBeInTheDocument();
  });

  it('distinguishes an empty directory from an empty filtered result', async () => {
    const user = userEvent.setup();
    useSubscriptionsMock.mockReturnValue({
      data: { items: [], page: 1, limit: 10, total: 0 },
      isPending: false,
      isError: false,
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
    await user.click(screen.getByRole('combobox', { name: 'Filter by course' }));
    await user.click(screen.getByRole('option', { name: 'Robotics' }));

    await waitFor(() => {
      expect(useSubscriptionsMock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        schoolId: 'school-1',
        courseId: 'course-1',
        status: 'UPCOMING',
      });
    });
  });
});
