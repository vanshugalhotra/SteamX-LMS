import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '../model/types';

const { revokeMutateAsync, toastSuccess, toastError, useRevokeSubscriptionMock } = vi.hoisted(
  () => ({
    revokeMutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    useRevokeSubscriptionMock: vi.fn(),
  }),
);

vi.mock('../queries', () => ({
  useRevokeSubscription: useRevokeSubscriptionMock,
}));
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

import { SubscriptionCard } from './SubscriptionCard';
import { PATHS } from '@/lib/paths';

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

function renderCard(item = subscription) {
  return render(
    <MemoryRouter>
      <SubscriptionCard subscription={item} />
    </MemoryRouter>,
  );
}

describe('SubscriptionCard actions', () => {
  beforeEach(() => {
    revokeMutateAsync.mockReset().mockResolvedValue(null);
    toastSuccess.mockReset();
    toastError.mockReset();
    useRevokeSubscriptionMock.mockReturnValue({
      mutateAsync: revokeMutateAsync,
      isPending: false,
    });
  });

  it('links to editing and confirms before revoking', async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      PATHS.admin.subscriptionEdit(subscription.id),
    );
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(screen.getByRole('dialog', { name: 'Revoke this subscription?' })).toBeInTheDocument();
    expect(revokeMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Revoke subscription' }));

    await waitFor(() => {
      expect(revokeMutateAsync).toHaveBeenCalledWith(subscription.id);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Subscription revoked');
  });

  it('does not offer revoke for expired subscriptions', () => {
    renderCard({ ...subscription, status: 'EXPIRED' });

    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });
});
