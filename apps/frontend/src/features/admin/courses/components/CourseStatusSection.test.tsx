import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../model/types';

const { updateStatusMutateAsync, toastSuccess } = vi.hoisted(() => ({
  updateStatusMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess },
}));

vi.mock('../queries', () => ({
  useUpdateCourseStatus: () => ({ mutateAsync: updateStatusMutateAsync, isPending: false }),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    confirmLabel,
    title,
    onConfirm,
  }: {
    open: boolean;
    confirmLabel: string;
    title: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <>
        <p>{title}</p>
        <button type="button" onClick={onConfirm}>
          Confirm {confirmLabel}
        </button>
      </>
    ) : null,
}));

import { CourseStatusSection } from './CourseStatusSection';

const course: Course = {
  id: 'course-1',
  title: 'Robotics',
  description: null,
  status: 'ACTIVE',
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

describe('CourseStatusSection', () => {
  beforeEach(() => {
    updateStatusMutateAsync.mockReset();
    toastSuccess.mockReset();
  });

  it('only offers the allowed transition and confirms before archiving', async () => {
    const user = userEvent.setup();
    updateStatusMutateAsync.mockResolvedValue({ ...course, status: 'ARCHIVED' });

    render(<CourseStatusSection course={course} />);

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(updateStatusMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({ id: 'course-1', status: 'ARCHIVED' });
    expect(toastSuccess).toHaveBeenCalledWith('Course archived');
  });

  it('confirms before publishing a draft course', async () => {
    const user = userEvent.setup();
    const draftCourse = { ...course, status: 'DRAFT' as const };
    updateStatusMutateAsync.mockResolvedValue({ ...draftCourse, status: 'ACTIVE' });

    render(<CourseStatusSection course={draftCourse} />);

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(updateStatusMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm Publish' }));

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({ id: 'course-1', status: 'ACTIVE' });
    expect(toastSuccess).toHaveBeenCalledWith('Course published');
  });

  it('uses the publish-again label when restoring an archived course', async () => {
    const user = userEvent.setup();
    const archivedCourse = { ...course, status: 'ARCHIVED' as const };
    updateStatusMutateAsync.mockResolvedValue({ ...archivedCourse, status: 'ACTIVE' });

    render(<CourseStatusSection course={archivedCourse} compact />);

    await user.click(screen.getByRole('button', { name: 'Publish again' }));
    expect(screen.getByText('Publish course again?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Publish again' }));

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({ id: 'course-1', status: 'ACTIVE' });
    expect(toastSuccess).toHaveBeenCalledWith('Course published');
  });

  it('shows compact-mode errors on a separate full-width row', async () => {
    const user = userEvent.setup();
    updateStatusMutateAsync.mockRejectedValue(new Error('Request failed'));

    render(<CourseStatusSection course={course} compact />);

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(screen.getByRole('alert')).toHaveClass('basis-full');
  });
});
