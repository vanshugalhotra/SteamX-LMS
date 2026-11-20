import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Delivery } from '../model/types';

const { updateStatusMock, toastSuccess } = vi.hoisted(() => ({
  updateStatusMock: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
vi.mock('../queries', () => ({
  useUpdateDeliveryStatus: () => ({ mutateAsync: updateStatusMock, isPending: false }),
  useCreateDelivery: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDeliveryLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/ui/action-menu', () => ({
  ActionMenu: ({ actions }: { actions: { label: string; onSelect: () => void }[] }) => (
    <div>
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={action.onSelect}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('@/components/ui/confirm-dialog', async () => {
  const { ConfirmDialogMock } = await import('@/test/mocks/confirm-dialog');
  return { ConfirmDialog: ConfirmDialogMock };
});

import { DeliveryCard } from './DeliveryCard';

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

describe('DeliveryCard', () => {
  beforeEach(() => {
    updateStatusMock.mockReset().mockResolvedValue({ ...delivery, status: 'INACTIVE' });
    toastSuccess.mockReset();
  });

  it('confirms before deactivating a delivery', async () => {
    const user = userEvent.setup();
    render(<DeliveryCard delivery={delivery} schoolName="North School" />);

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(updateStatusMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Students will no longer have access to Robotics - Grade 5 Blue - 2026-27.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Deactivate delivery' }));

    expect(updateStatusMock).toHaveBeenCalledWith({ id: 'delivery-1', status: 'INACTIVE' });
    expect(toastSuccess).toHaveBeenCalledWith('Delivery deactivated');
  });

  it('confirms before activating an inactive delivery', async () => {
    const user = userEvent.setup();
    const inactiveDelivery = { ...delivery, status: 'INACTIVE' as const };
    updateStatusMock.mockResolvedValue({ ...inactiveDelivery, status: 'ACTIVE' });
    render(<DeliveryCard delivery={inactiveDelivery} schoolName="North School" />);

    await user.click(screen.getByRole('button', { name: 'Activate' }));
    expect(
      screen.getByText(
        'Activating requires an active course, a current subscription, and available delivery capacity.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Activate delivery' }));

    expect(updateStatusMock).toHaveBeenCalledWith({ id: 'delivery-1', status: 'ACTIVE' });
    expect(toastSuccess).toHaveBeenCalledWith('Delivery activated');
  });

  it('shows an error when the status update fails', async () => {
    const user = userEvent.setup();
    updateStatusMock.mockRejectedValue(new Error('Request failed'));
    render(<DeliveryCard delivery={delivery} schoolName="North School" />);

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Deactivate delivery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
