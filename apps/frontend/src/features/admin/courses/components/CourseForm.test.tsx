import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import type { Course } from '../model/types';

const { createMutateAsync, updateMutateAsync, updateStatusMutateAsync, toastSuccess } = vi.hoisted(
  () => ({
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    updateStatusMutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
  }),
);

vi.mock('sonner', () => ({
  toast: { success: toastSuccess },
}));

vi.mock('../queries', () => ({
  useCreateCourse: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateCourse: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useUpdateCourseStatus: () => ({ mutateAsync: updateStatusMutateAsync, isPending: false }),
}));

import { CourseForm } from './CourseForm';

const createdCourse: Course = {
  id: 'course-1',
  title: 'Robotics',
  description: null,
  status: 'DRAFT',
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

function renderCourseForm(onDone = vi.fn()) {
  render(<CourseForm onDone={onDone} onCancel={vi.fn()} />);
  return onDone;
}

describe('CourseForm', () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    updateStatusMutateAsync.mockReset();
    toastSuccess.mockReset();
  });

  it('creates courses as drafts by default', async () => {
    const user = userEvent.setup();
    const onDone = renderCourseForm();
    createMutateAsync.mockResolvedValue(createdCourse);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Course title/ }), 'Robotics');
    await user.click(screen.getByRole('button', { name: 'Add course' }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        title: 'Robotics',
        description: null,
      });
    });
    expect(updateStatusMutateAsync).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('course-1');
    expect(toastSuccess).toHaveBeenCalledWith('Course created as a draft');
  });

  it('reports a field-specific backend validation error', async () => {
    const user = userEvent.setup();
    renderCourseForm();
    createMutateAsync.mockRejectedValue(
      new ApiError(400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'title', errors: ['Title is already reserved.'] }],
      }),
    );

    await user.type(screen.getByRole('textbox', { name: /Course title/ }), 'Robotics');
    await user.click(screen.getByRole('button', { name: 'Add course' }));

    expect(await screen.findByText('Title is already reserved.')).toBeInTheDocument();
  });
});
