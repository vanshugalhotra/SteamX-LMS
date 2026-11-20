import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Delivery } from '../model/types';

const {
  useCoursesMock,
  useSchoolSearchMock,
  useCreateDeliveryMock,
  useUpdateDeliveryLabelMock,
  createMutateAsyncMock,
  renameMutateAsyncMock,
  toastSuccess,
} = vi.hoisted(() => ({
  useCoursesMock: vi.fn(),
  useSchoolSearchMock: vi.fn(),
  useCreateDeliveryMock: vi.fn(),
  useUpdateDeliveryLabelMock: vi.fn(),
  createMutateAsyncMock: vi.fn(),
  renameMutateAsyncMock: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
vi.mock('@/features/admin/courses/queries', () => ({ useCourses: useCoursesMock }));
vi.mock('@/features/admin/schools/queries', () => ({ useSchoolSearch: useSchoolSearchMock }));
vi.mock('../queries', () => ({
  useCreateDelivery: useCreateDeliveryMock,
  useUpdateDeliveryLabel: useUpdateDeliveryLabelMock,
}));

import { DeliveryForm } from './DeliveryForm';

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

describe('DeliveryForm', () => {
  beforeEach(() => {
    useCoursesMock.mockReturnValue({
      data: { items: [{ id: 'course-1', title: 'Robotics' }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSchoolSearchMock.mockReturnValue({
      options: [{ value: 'school-1', label: 'North School' }],
      isPending: false,
      isError: false,
    });
    createMutateAsyncMock.mockReset().mockResolvedValue(delivery);
    renameMutateAsyncMock.mockReset().mockResolvedValue(delivery);
    useCreateDeliveryMock.mockReturnValue({ mutateAsync: createMutateAsyncMock, isPending: false });
    useUpdateDeliveryLabelMock.mockReturnValue({
      mutateAsync: renameMutateAsyncMock,
      isPending: false,
    });
    toastSuccess.mockReset();
  });

  it('creates a delivery with the selected school, course, year, and name', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<DeliveryForm mode="create" onDone={onDone} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'School *' }));
    await user.click(screen.getByRole('option', { name: 'North School' }));
    await user.selectOptions(screen.getByLabelText('Course *'), 'course-1');
    await user.type(screen.getByLabelText('Academic year *'), '2026-27');
    await user.type(screen.getByLabelText('Delivery name *'), 'Grade 5 Blue');
    await user.click(screen.getByRole('button', { name: 'Create delivery' }));

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        schoolId: 'school-1',
        courseId: 'course-1',
        academicYear: '2026-27',
        label: 'Grade 5 Blue',
      });
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith('Delivery created');
  });

  it('rejects an invalid academic-year format without creating a delivery', async () => {
    const user = userEvent.setup();
    render(<DeliveryForm mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'School *' }));
    await user.click(screen.getByRole('option', { name: 'North School' }));
    await user.selectOptions(screen.getByLabelText('Course *'), 'course-1');
    await user.type(screen.getByLabelText('Academic year *'), '2026/27');
    await user.type(screen.getByLabelText('Delivery name *'), 'Grade 5 Blue');
    await user.click(screen.getByRole('button', { name: 'Create delivery' }));

    expect(
      await screen.findByText('Enter the academic year in YYYY-YY format, such as 2026-27.'),
    ).toBeInTheDocument();
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('updates only the delivery name when renaming', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<DeliveryForm mode="rename" delivery={delivery} onDone={onDone} onCancel={vi.fn()} />);

    const name = screen.getByLabelText('Name *');
    await user.clear(name);
    await user.type(name, 'Grade 5 Green');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(renameMutateAsyncMock).toHaveBeenCalledWith({
        id: 'delivery-1',
        body: { label: 'Grade 5 Green' },
      });
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
