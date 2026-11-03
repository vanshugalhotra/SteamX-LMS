import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../model/types';

const { useCoursesMock } = vi.hoisted(() => ({ useCoursesMock: vi.fn() }));

vi.mock('../queries', () => ({ useCourses: useCoursesMock }));
vi.mock('@/features/admin/components/HeaderSlot', () => ({
  HeaderSlot: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { CoursesPage } from './CoursesPage';

const course: Course = {
  id: 'course-1',
  title: 'Robotics',
  description: 'Build classroom robots.',
  status: 'DRAFT',
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

describe('CoursesPage', () => {
  beforeEach(() => {
    useCoursesMock.mockReset();
    useCoursesMock.mockReturnValue({
      data: { items: [course], page: 1, limit: 6, total: 1 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('passes the selected status filter and debounced search to the course query', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CoursesPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Draft' }));
    await waitFor(() => {
      expect(useCoursesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'DRAFT', q: '' }),
      );
    });

    await user.type(screen.getByRole('searchbox', { name: 'Search courses' }), 'Robotics');
    await waitFor(
      () => {
        expect(useCoursesMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: 'DRAFT', q: 'Robotics' }),
        );
      },
      { timeout: 1000 },
    );
  });
});
