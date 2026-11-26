import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseOutlineResponse } from '../model/types';
import { createReleaseLesson, releaseOutlineFixture } from '@/test/fixtures/release-outline';
import { formatDate } from '@/lib/date-helper';

const mocks = vi.hoisted(() => ({
  releaseLesson: vi.fn(),
  unreleaseLesson: vi.fn(),
  unreleaseModule: vi.fn(),
  releaseModule: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  releaseLessonPending: false,
  unreleaseModulePending: false,
  releaseModulePending: false,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@/components/ui/confirm-dialog', async () => {
  const { ConfirmDialogMock } = await import('@/test/mocks/confirm-dialog');
  return { ConfirmDialog: ConfirmDialogMock };
});

vi.mock('../queries', () => ({
  useReleaseDeliveryLesson: () => ({
    mutateAsync: mocks.releaseLesson,
    isPending: mocks.releaseLessonPending,
  }),
  useUnreleaseDeliveryLesson: () => ({
    mutateAsync: mocks.unreleaseLesson,
  }),
  useUnreleaseDeliveryModule: () => ({
    mutateAsync: mocks.unreleaseModule,
    isPending: mocks.unreleaseModulePending,
  }),
  useReleaseDeliveryModule: () => ({
    mutateAsync: mocks.releaseModule,
    isPending: mocks.releaseModulePending,
  }),
}));

import { DeliveryReleaseOutline } from './DeliveryReleaseOutline';

function renderOutline(releaseDisabledReason?: string) {
  return render(
    <DeliveryReleaseOutline
      deliveryId="delivery-1"
      outline={releaseOutlineFixture}
      releaseDisabledReason={releaseDisabledReason}
    />,
  );
}

describe('DeliveryReleaseOutline release controls', () => {
  beforeEach(() => {
    mocks.releaseLesson.mockReset().mockResolvedValue({});
    mocks.unreleaseLesson.mockReset().mockResolvedValue(undefined);
    mocks.unreleaseModule.mockReset().mockResolvedValue({ succeeded: 1, failures: [] });
    mocks.releaseModule.mockReset().mockResolvedValue({
      moduleId: 'module-1',
      newlyReleased: 1,
      alreadyReleased: 1,
      skippedNotReleasable: 1,
    });
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.releaseLessonPending = false;
    mocks.unreleaseModulePending = false;
    mocks.releaseModulePending = false;
  });

  it('releases and unreleases eligible student lessons, showing status and release date', async () => {
    const user = userEvent.setup();
    renderOutline();

    expect(screen.getAllByText(`Released ${formatDate('2026-11-18T12:00:00.000Z')}`)).toHaveLength(
      2,
    );
    expect(screen.getByText('Not released')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Release What plants need' }));
    expect(mocks.releaseLesson).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      lessonId: 'unreleased-lesson',
    });
    await user.click(screen.getByRole('button', { name: 'Unrelease How plants make food' }));
    expect(mocks.unreleaseLesson).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      lessonId: 'released-lesson',
    });
    mocks.releaseLesson.mockRejectedValueOnce(new Error('release failed'));
    await user.click(screen.getByRole('button', { name: 'Release What plants need' }));
    expect(mocks.toastError).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Release module' }));
    expect(mocks.releaseModule).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      moduleId: 'module-1',
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('1 lesson released; 1 not eligible');
  });

  it('disables unavailable and pending release actions but allows eligible unrelease', () => {
    const { unmount } = renderOutline('Releasing lessons requires a current subscription.');
    expect(screen.getByRole('button', { name: 'Release module' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Release What plants need' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unrelease How plants make food' })).toBeEnabled();
    unmount();

    mocks.releaseLessonPending = true;
    mocks.releaseModulePending = true;
    mocks.unreleaseModulePending = true;
    renderOutline();

    expect(screen.getByRole('button', { name: 'Release module' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Release What plants need' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unrelease How plants make food' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unrelease module' })).toBeDisabled();
  });

  it('confirms module unrelease for currently released eligible lessons', async () => {
    const user = userEvent.setup();
    const partialOutline: ReleaseOutlineResponse = {
      modules: [
        {
          ...releaseOutlineFixture.modules[0],
          lessons: [
            releaseOutlineFixture.modules[0].lessons[0],
            createReleaseLesson('second-released-lesson', 'Second lesson', {
              released: true,
              releasedAt: '2026-11-18T12:00:00.000Z',
            }),
            ...releaseOutlineFixture.modules[0].lessons.slice(2),
          ],
        },
      ],
    };
    mocks.unreleaseModule.mockResolvedValueOnce({
      succeeded: 1,
      failures: [new Error('failed')],
    });
    render(<DeliveryReleaseOutline deliveryId="delivery-1" outline={partialOutline} />);

    await user.click(screen.getByRole('button', { name: 'Unrelease module' }));
    expect(screen.getByText(/2 currently released student lessons/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Unrelease module' }));
    await vi.waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        expect.stringContaining('1 of 2 lessons unreleased; 1 failed.'),
      );
    });
    expect(mocks.unreleaseModule).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      lessonIds: ['released-lesson', 'second-released-lesson'],
    });
  });
});
