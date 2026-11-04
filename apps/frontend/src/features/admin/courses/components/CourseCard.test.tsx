import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../model/types';

const { updateStatusMutateAsync, toastSuccess, toastError, useCourseOutlineMock } = vi.hoisted(
  () => ({
    updateStatusMutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    useCourseOutlineMock: vi.fn(),
  }),
);

vi.mock('../queries', () => ({
  useCourseOutline: useCourseOutlineMock,
  useUpdateCourseStatus: () => ({ mutateAsync: updateStatusMutateAsync, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    confirmLabel,
    title,
    description,
    onConfirm,
  }: {
    open: boolean;
    confirmLabel: string;
    title: string;
    description: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div>
        <p>{title}</p>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          Confirm {confirmLabel}
        </button>
      </div>
    ) : null,
}));

import { CourseCard } from './CourseCard';

const course: Course = {
  id: 'course-1',
  title: 'Robotics',
  description: 'Build classroom robots.',
  status: 'DRAFT',
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

function renderCard(item = course) {
  return render(
    <MemoryRouter>
      <CourseCard course={item} />
    </MemoryRouter>,
  );
}

describe('CourseCard actions menu', () => {
  beforeEach(() => {
    updateStatusMutateAsync.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    useCourseOutlineMock.mockReturnValue({
      data: { modules: [{ lessons: [{}, {}] }] },
      isPending: false,
      isError: false,
    });
  });

  it('offers edit, publish, and archive actions for a draft course', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Actions for Robotics' }));

    expect(screen.getByRole('link', { name: 'Edit course' })).toHaveAttribute(
      'href',
      '/steamx/admin/courses/course-1/edit',
    );
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('1 module · 2 lessons')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveClass(
      'text-danger',
      'hover:bg-danger-soft',
    );
  });

  it('confirms before publishing a draft course', async () => {
    const user = userEvent.setup();
    updateStatusMutateAsync.mockResolvedValue({ ...course, status: 'ACTIVE' });
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Actions for Robotics' }));
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByText('Publish course?')).toBeVisible();
    expect(
      screen.getByText('“Robotics” will be published and made available for use.'),
    ).toBeVisible();
    expect(updateStatusMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm Publish' }));

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({ id: 'course-1', status: 'ACTIVE' });
    expect(toastSuccess).toHaveBeenCalledWith('Course published');
  });

  it('only offers archive for an active course', async () => {
    const user = userEvent.setup();
    renderCard({ ...course, status: 'ACTIVE' });

    await user.click(screen.getByRole('button', { name: 'Actions for Robotics' }));

    expect(screen.getByRole('button', { name: 'Archive' })).toHaveClass('text-danger');
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('offers publishing an archived course again', async () => {
    const user = userEvent.setup();
    renderCard({ ...course, status: 'ARCHIVED' });

    await user.click(screen.getByRole('button', { name: 'Actions for Robotics' }));

    expect(screen.getByRole('button', { name: 'Publish again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('keeps the actions keyboard accessible and restores focus when dismissed', async () => {
    const user = userEvent.setup();
    renderCard();

    const trigger = screen.getByRole('button', { name: 'Actions for Robotics' });
    await user.click(trigger);
    expect(screen.getByRole('group', { name: 'Course actions for Robotics' })).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Edit course' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(
      screen.queryByRole('group', { name: 'Course actions for Robotics' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
