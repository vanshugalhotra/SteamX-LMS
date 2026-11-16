import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '../model/types';

const {
  useCoursesMock,
  useSchoolSearchMock,
  useCreateSubscriptionMock,
  useRenewSubscriptionMock,
  useUpdateSubscriptionMock,
  createMutateAsyncMock,
  renewMutateAsyncMock,
  updateMutateAsyncMock,
} = vi.hoisted(() => ({
  useCoursesMock: vi.fn(),
  useSchoolSearchMock: vi.fn(),
  useCreateSubscriptionMock: vi.fn(),
  useRenewSubscriptionMock: vi.fn(),
  useUpdateSubscriptionMock: vi.fn(),
  createMutateAsyncMock: vi.fn(),
  renewMutateAsyncMock: vi.fn(),
  updateMutateAsyncMock: vi.fn(),
}));

vi.mock('@/features/admin/courses/queries', () => ({
  useCourses: useCoursesMock,
}));
vi.mock('@/features/admin/schools/queries', () => ({
  useSchoolSearch: useSchoolSearchMock,
}));
vi.mock('../queries', () => ({
  useCreateSubscription: useCreateSubscriptionMock,
  useRenewSubscription: useRenewSubscriptionMock,
  useUpdateSubscription: useUpdateSubscriptionMock,
}));

import { SubscriptionForm } from './SubscriptionForm';

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

describe('SubscriptionForm', () => {
  beforeEach(() => {
    useCoursesMock.mockClear();
    useCoursesMock.mockReturnValue({
      data: { items: [{ id: 'course-1', title: 'Robotics', status: 'ACTIVE' }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSchoolSearchMock.mockReturnValue({
      options: [{ value: 'school-1', label: 'Greenfield School' }],
      isPending: false,
      isError: false,
    });
    createMutateAsyncMock.mockReset().mockResolvedValue(subscription);
    renewMutateAsyncMock.mockReset().mockResolvedValue(subscription);
    updateMutateAsyncMock.mockReset().mockResolvedValue(subscription);
    useCreateSubscriptionMock.mockReturnValue({
      mutateAsync: createMutateAsyncMock,
      isPending: false,
    });
    useRenewSubscriptionMock.mockReturnValue({
      mutateAsync: renewMutateAsyncMock,
      isPending: false,
    });
    useUpdateSubscriptionMock.mockReturnValue({
      mutateAsync: updateMutateAsyncMock,
      isPending: false,
    });
  });

  it('creates a subscription with the selected school, course, dates, and limit', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    render(<SubscriptionForm mode="create" onDone={onDone} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'School *' }));
    await user.click(screen.getByRole('option', { name: 'Greenfield School' }));
    await user.selectOptions(screen.getByLabelText('Course *'), 'course-1');
    fireEvent.change(screen.getByLabelText('Start date *'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('End date *'), {
      target: { value: '2027-06-30' },
    });
    await user.clear(screen.getByLabelText('Max deliveries *'));
    await user.type(screen.getByLabelText('Max deliveries *'), '4');
    await user.click(screen.getByRole('button', { name: 'Create subscription' }));

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        schoolId: 'school-1',
        courseId: 'course-1',
        startDate: '2026-11-01',
        endDate: '2027-06-30',
        maxDeliveries: 4,
      });
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('rejects a reversed date range before making the request', async () => {
    const user = userEvent.setup();

    render(<SubscriptionForm mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'School *' }));
    await user.click(screen.getByRole('option', { name: 'Greenfield School' }));
    await user.selectOptions(screen.getByLabelText('Course *'), 'course-1');
    fireEvent.change(screen.getByLabelText('Start date *'), {
      target: { value: '2027-06-30' },
    });
    fireEvent.change(screen.getByLabelText('End date *'), {
      target: { value: '2027-06-29' },
    });
    await user.type(screen.getByLabelText('Max deliveries *'), '4');
    await user.click(screen.getByRole('button', { name: 'Create subscription' }));

    expect(
      await screen.findByText('End date must be on or after the start date.'),
    ).toBeInTheDocument();
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('requires a delivery limit instead of defaulting new subscriptions to one', async () => {
    const user = userEvent.setup();

    render(<SubscriptionForm mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'School *' }));
    await user.click(screen.getByRole('option', { name: 'Greenfield School' }));
    await user.selectOptions(screen.getByLabelText('Course *'), 'course-1');
    await user.click(screen.getByRole('button', { name: 'Create subscription' }));

    expect(await screen.findByText('Enter a number greater than 0.')).toBeInTheDocument();
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('renews after the current term and keeps the existing delivery limit', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    render(
      <SubscriptionForm
        mode="renew"
        subscription={subscription}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    expect(useCoursesMock).toHaveBeenCalledWith(
      { page: 1, limit: 100, q: '', status: 'ACTIVE' },
      { enabled: false },
    );
    expect(screen.getByLabelText('Start date *')).toHaveValue('2027-07-01');
    expect(screen.getByLabelText('End date *')).toHaveValue('2028-06-30');
    expect(screen.getByLabelText('Max deliveries *')).toHaveValue(4);
    await user.click(screen.getByRole('button', { name: 'Renew subscription' }));

    await waitFor(() => {
      expect(renewMutateAsyncMock).toHaveBeenCalledWith({
        id: 'subscription-1',
        body: {
          startDate: '2027-07-01',
          endDate: '2028-06-30',
          maxDeliveries: 4,
        },
      });
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('updates only the editable end date and delivery limit', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    render(
      <SubscriptionForm
        mode="edit"
        subscription={subscription}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Start date *')).toBeDisabled();
    expect(screen.getByLabelText('Start date *')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('End date *')).toHaveValue('2027-06-30');
    expect(screen.getByLabelText('Max deliveries *')).toHaveValue(4);
    await user.clear(screen.getByLabelText('End date *'));
    await user.type(screen.getByLabelText('End date *'), '2027-07-31');
    await user.clear(screen.getByLabelText('Max deliveries *'));
    await user.type(screen.getByLabelText('Max deliveries *'), '5');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        id: 'subscription-1',
        body: { endDate: '2027-07-31', maxDeliveries: 5 },
      });
    });
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
    expect(renewMutateAsyncMock).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
