import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CourseOutline } from '../model/types';

const { useCourseOutlineMock, updateStatusMutateAsync, toastSuccess } = vi.hoisted(() => ({
  useCourseOutlineMock: vi.fn(),
  updateStatusMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../queries', () => ({
  useCourseOutline: useCourseOutlineMock,
  useUpdateCourseStatus: () => ({ mutateAsync: updateStatusMutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        Confirm {confirmLabel}
      </button>
    ) : null,
}));

import { CourseCurriculumPage } from './CourseCurriculumPage';

const outline: CourseOutline = {
  course: {
    id: 'course-1',
    title: 'Science Grade 6',
    description: 'Plants, matter, forces and energy.',
    status: 'ACTIVE',
  },
  modules: [
    {
      id: 'module-1',
      title: 'Plants & Energy',
      position: 1,
      status: 'ACTIVE',
      lessons: [
        {
          id: 'lesson-1',
          title: 'How plants make food',
          position: 1,
          status: 'ACTIVE',
          audience: 'STUDENT',
        },
        {
          id: 'lesson-2',
          title: 'Teaching notes: lab setup',
          position: 2,
          status: 'DRAFT',
          audience: 'TEACHER_ONLY',
        },
      ],
    },
  ],
};

function pageElement() {
  return (
    <MemoryRouter initialEntries={['/steamx/admin/courses/course-1/curriculum']}>
      <Routes>
        <Route path="/steamx/admin/courses/:id/curriculum" element={<CourseCurriculumPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(pageElement());
}

describe('CourseCurriculumPage', () => {
  beforeEach(() => {
    useCourseOutlineMock.mockReset();
    updateStatusMutateAsync.mockReset();
    toastSuccess.mockReset();
  });

  it('shows course summary, ordered modules, lessons, and audience', () => {
    useCourseOutlineMock.mockReturnValue({
      data: outline,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Science Grade 6' })).toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plants & Energy' })).toBeInTheDocument();
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('Students').closest('span')).toHaveClass(
      'bg-[#f3e8ff]',
      'text-[#6b21a8]',
    );
    expect(screen.getByText('Students').parentElement?.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('Teachers only')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit course' })).toHaveClass(
      'bg-transparent',
      'border-indigo-950/30',
    );
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Course status actions' })).toBeInTheDocument();
  });

  it('confirms before archiving the course from the curriculum page', async () => {
    const user = userEvent.setup();
    useCourseOutlineMock.mockReturnValue({
      data: outline,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    updateStatusMutateAsync.mockResolvedValue({ ...outline.course, status: 'ARCHIVED' });

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      id: 'course-1',
      status: 'ARCHIVED',
    });
  });

  it('collapses and expands all modules', async () => {
    const user = userEvent.setup();
    useCourseOutlineMock.mockReturnValue({
      data: outline,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    const collapseButton = screen.getByRole('button', { name: 'Collapse all' });
    expect(collapseButton).toHaveClass(
      'rounded-full',
      'border-teal-300',
      'bg-white',
      'text-teal-900',
      'shadow-sm',
    );
    await user.click(collapseButton);
    expect(screen.getByText('How plants make food')).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
  });

  it('keeps new modules expanded after an outline refresh', async () => {
    const user = userEvent.setup();
    useCourseOutlineMock.mockReturnValue({
      data: outline,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { rerender } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Collapse all' }));

    const refreshedOutline: CourseOutline = {
      ...outline,
      modules: [
        ...outline.modules,
        {
          id: 'module-2',
          title: 'Matter and Energy',
          position: 2,
          status: 'ACTIVE',
          lessons: [
            {
              id: 'lesson-3',
              title: 'States of matter',
              position: 1,
              status: 'ACTIVE',
              audience: 'STUDENT',
            },
          ],
        },
      ],
    };
    useCourseOutlineMock.mockReturnValue({
      data: refreshedOutline,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    rerender(pageElement());

    expect(screen.getByText('How plants make food')).not.toBeVisible();
    expect(screen.getByText('States of matter')).toBeVisible();
  });

  it('shows an empty state when the course has no modules', () => {
    useCourseOutlineMock.mockReturnValue({
      data: { ...outline, modules: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('No modules yet')).toBeInTheDocument();
    expect(screen.getAllByText('0', { selector: 'p' })).toHaveLength(2);
  });

  it('shows a loading state while the outline is loading', () => {
    useCourseOutlineMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading course curriculum' })).toBeInTheDocument();
  });

  it('shows an error and allows retrying', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useCourseOutlineMock.mockReturnValue({
      data: undefined,
      error: new Error('Request failed'),
      isPending: false,
      isError: true,
      refetch,
    });

    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps existing curriculum visible when a background refresh fails', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useCourseOutlineMock.mockReturnValue({
      data: outline,
      isPending: false,
      isError: false,
      refetch,
    });

    const { rerender } = renderPage();
    useCourseOutlineMock.mockReturnValue({
      data: outline,
      error: new Error('Refresh failed'),
      isPending: false,
      isError: true,
      refetch,
    });
    rerender(pageElement());

    expect(screen.getByRole('heading', { name: 'Plants & Energy' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
