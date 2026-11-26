import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllTeacherDeliveries, fetchTeacherDeliveries } from '../deliveries/api/api';
import type { TeacherDelivery } from '../deliveries/model/types';
import { fetchDeliveryReleaseOutline } from '@/features/deliveries/api/api';
import type { ReleaseOutlineResponse } from '@/features/deliveries/model/types';
import { PATHS } from '@/lib/paths';
import type { Paginated } from '@/lib/pagination';
import { TeacherDeliveriesPage } from './TeacherDeliveriesPage';

vi.mock('../deliveries/api/api', () => ({
  fetchAllTeacherDeliveries: vi.fn(),
  fetchTeacherDeliveries: vi.fn(),
}));
vi.mock('@/features/deliveries/api/api', () => ({
  fetchDelivery: vi.fn(),
  fetchDeliveryReleaseOutline: vi.fn(),
}));

const mockedFetchAllTeacherDeliveries = vi.mocked(fetchAllTeacherDeliveries);
const mockedFetchTeacherDeliveries = vi.mocked(fetchTeacherDeliveries);
const mockedFetchDeliveryReleaseOutline = vi.mocked(fetchDeliveryReleaseOutline);
const outline: ReleaseOutlineResponse = {
  modules: [
    {
      id: 'module-1',
      title: 'Module 1',
      position: 1,
      releaseState: 'PARTIAL',
      releasedCount: 1,
      releasableLessonCount: 2,
      lessons: [
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          position: 1,
          audience: 'STUDENT',
          released: true,
          releasedAt: '2026-11-18T12:00:00.000Z',
          releasable: true,
        },
        {
          id: 'lesson-2',
          title: 'Lesson 2',
          position: 2,
          audience: 'STUDENT',
          released: false,
          releasedAt: null,
          releasable: true,
        },
      ],
    },
  ],
};
const delivery: TeacherDelivery = {
  id: 'delivery-1',
  schoolId: 'school-1',
  course: { id: 'course-1', title: 'Robotics' },
  label: 'Grade 5 Blue',
  academicYear: '2026-27',
  status: 'INACTIVE',
  displayName: 'Robotics - Grade 5 Blue - 2026-27',
  subscriptionActive: false,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};
const creativeDelivery: TeacherDelivery = {
  ...delivery,
  id: 'delivery-2',
  course: { id: 'course-2', title: 'Creative Coding' },
  label: 'Grade 6 Red',
  status: 'ACTIVE',
  displayName: 'Creative Coding - Grade 6 Red - 2026-27',
  subscriptionActive: true,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TeacherDeliveriesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedFetchAllTeacherDeliveries.mockReset();
  mockedFetchAllTeacherDeliveries.mockResolvedValue([delivery]);
  mockedFetchTeacherDeliveries.mockReset();
  mockedFetchTeacherDeliveries.mockResolvedValue({
    items: [delivery],
    page: 1,
    limit: 20,
    total: 1,
  });
  mockedFetchDeliveryReleaseOutline.mockReset();
  mockedFetchDeliveryReleaseOutline.mockResolvedValue(outline);
});

describe('TeacherDeliveriesPage', () => {
  it('shows a loading state while assigned deliveries are loading', () => {
    mockedFetchTeacherDeliveries.mockReturnValue(new Promise<Paginated<TeacherDelivery>>(vi.fn()));
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading deliveries' })).toBeInTheDocument();
  });

  it('shows an empty state when the teacher has no assigned deliveries', async () => {
    mockedFetchTeacherDeliveries.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    renderPage();

    expect(await screen.findByText('No deliveries assigned yet.')).toBeInTheDocument();
  });

  it('offers retry after an error and loads deliveries on retry', async () => {
    const user = userEvent.setup();
    mockedFetchTeacherDeliveries
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        items: [delivery],
        page: 1,
        limit: 20,
        total: 1,
      });
    renderPage();

    await screen.findByText("We couldn't load your deliveries. Please try again.");
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Grade 5 Blue · 2026-27')).toBeInTheDocument();
    expect(mockedFetchTeacherDeliveries).toHaveBeenCalledTimes(2);
  });

  it('shows returned status values and links each card to teacher delivery details', async () => {
    renderPage();

    const cardLink = await screen.findByRole('link', {
      name: 'Open Robotics - Grade 5 Blue - 2026-27',
    });
    expect(cardLink).toHaveAttribute('href', PATHS.teacher.delivery(delivery.id));
    expect(screen.getByText('Robotics')).toBeInTheDocument();
    expect(cardLink).toHaveTextContent('Inactive');
    expect(cardLink).toHaveTextContent('Subscription inactive');
    expect(await screen.findByText('1 of 2 lessons released')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Release lessons' })).toHaveAttribute(
      'href',
      PATHS.teacher.delivery(delivery.id),
    );
  });

  it('can retry loading a delivery card release outline', async () => {
    const user = userEvent.setup();
    mockedFetchDeliveryReleaseOutline
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(outline);
    renderPage();

    await screen.findByText("Lesson progress couldn't be loaded.");
    await user.click(screen.getByRole('button', { name: 'Retry progress' }));

    expect(await screen.findByText('1 of 2 lessons released')).toBeInTheDocument();
    expect(mockedFetchDeliveryReleaseOutline).toHaveBeenCalledTimes(2);
  });

  it('filters assigned deliveries by status through the server-scoped list', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Grade 5 Blue · 2026-27');
    await user.click(screen.getByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      expect(mockedFetchTeacherDeliveries).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        status: 'INACTIVE',
      });
    });
  });

  it('searches matching deliveries across the teacher-scoped result set', async () => {
    const user = userEvent.setup();
    mockedFetchAllTeacherDeliveries.mockResolvedValue([delivery, creativeDelivery]);
    renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search my deliveries' }), 'creative');

    const cardLink = await screen.findByRole('link', {
      name: 'Open Creative Coding - Grade 6 Red - 2026-27',
    });
    expect(cardLink).toHaveTextContent('Creative Coding');
    expect(
      screen.queryByRole('link', { name: 'Open Robotics - Grade 5 Blue - 2026-27' }),
    ).not.toBeInTheDocument();
    expect(mockedFetchAllTeacherDeliveries).toHaveBeenCalledWith(undefined);
  });

  it('loads the next server page using the shared pagination controls', async () => {
    const user = userEvent.setup();
    mockedFetchTeacherDeliveries
      .mockResolvedValueOnce({
        items: [delivery],
        page: 1,
        limit: 20,
        total: 21,
      })
      .mockResolvedValueOnce({
        items: [{ ...delivery, id: 'delivery-2' }],
        page: 2,
        limit: 20,
        total: 21,
      });
    renderPage();

    await screen.findByText('Showing 1-20 of 21');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Showing 21-21 of 21')).toBeInTheDocument();
    expect(mockedFetchTeacherDeliveries).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
  });
});
