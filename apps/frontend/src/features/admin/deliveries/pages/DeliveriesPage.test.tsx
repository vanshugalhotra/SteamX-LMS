import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeliveries } from '../api/api';
import type { Delivery } from '../model/types';
import { PATHS } from '@/lib/paths';
import { DeliveriesPage } from './DeliveriesPage';

vi.mock('../api/api', () => ({
  createDelivery: vi.fn(),
  fetchDeliveries: vi.fn(),
  fetchDelivery: vi.fn(),
  updateDeliveryLabel: vi.fn(),
  updateDeliveryStatus: vi.fn(),
}));

vi.mock('@/features/admin/components/HeaderSlot', () => ({
  HeaderSlot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/admin/courses/queries', () => ({
  useCourses: () => ({
    data: { items: [{ id: 'course-1', title: 'Robotics' }] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCourseSearch: () => ({
    options: [{ value: 'course-1', label: 'Robotics' }],
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/features/admin/schools/queries', () => ({
  useAnySchoolSearch: () => ({
    options: [{ value: 'school-1', label: 'North School' }],
    isPending: false,
    isError: false,
  }),
  useAnySchoolSearchWhenEnabled: () => ({
    options: [{ value: 'school-1', label: 'North School' }],
    isPending: false,
    isError: false,
  }),
  useSchoolNames: () => new Map([['school-1', 'North School']]),
}));

const mockedFetchDeliveries = vi.mocked(fetchDeliveries);
const delivery: Delivery = {
  id: 'delivery-1',
  schoolId: 'school-1',
  course: { id: 'course-1', title: 'Robotics' },
  label: 'Grade 5 Blue',
  academicYear: '2026-27',
  status: 'ACTIVE',
  displayName: 'Robotics - Grade 5 Blue - 2026-27',
  subscriptionActive: true,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DeliveriesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedFetchDeliveries.mockReset();
  mockedFetchDeliveries.mockResolvedValue({
    items: [delivery],
    page: 1,
    limit: 20,
    total: 1,
  });
});

describe('DeliveriesPage', () => {
  it('links to the dedicated delivery creation page with the brand button style', () => {
    renderPage();

    const createLink = screen.getByRole('link', { name: 'Create delivery' });
    expect(createLink).toHaveAttribute('href', PATHS.admin.deliveryNew);
    expect(createLink).toHaveClass('bg-brand-navy', 'text-white');
  });

  it('combines status, course, and school filters', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Grade 5 Blue · 2026-27');
    expect(mockedFetchDeliveries).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: 20,
      schoolId: undefined,
      courseId: undefined,
      academicYear: undefined,
      status: undefined,
    });
    await user.click(screen.getByRole('button', { name: 'Inactive' }));
    await user.click(screen.getByRole('button', { name: 'Robotics' }));

    const school = screen.getByRole('combobox', { name: 'Filter by school' });
    await user.click(school);
    await user.click(await screen.findByRole('option', { name: 'North School' }));

    await waitFor(() => {
      expect(mockedFetchDeliveries).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        schoolId: 'school-1',
        courseId: 'course-1',
        academicYear: undefined,
        status: 'INACTIVE',
      });
    });
  });
});
