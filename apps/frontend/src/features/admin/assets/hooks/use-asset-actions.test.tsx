import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';

const { updateAsset, updateAssetStatus, deleteAsset, toastSuccess, toastError } = vi.hoisted(
  () => ({
    updateAsset: vi.fn(),
    updateAssetStatus: vi.fn(),
    deleteAsset: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }),
);

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock('../api/api', () => ({
  updateAsset,
  updateAssetStatus,
  deleteAsset,
}));

import { useDeleteAssetAction, useRenameAsset, useToggleAssetStatus } from './use-asset-actions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('asset action hooks', () => {
  beforeEach(() => {
    updateAsset.mockReset();
    updateAssetStatus.mockReset();
    deleteAsset.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('archives an asset and notifies on success', async () => {
    updateAssetStatus.mockResolvedValue({});
    const { result } = renderHook(() => useToggleAssetStatus(), { wrapper: createWrapper() });

    act(() => {
      result.current.toggleStatus({ id: 'asset-1', status: 'ACTIVE' });
    });

    await waitFor(() => {
      expect(updateAssetStatus).toHaveBeenCalledWith('asset-1', 'ARCHIVED');
      expect(toastSuccess).toHaveBeenCalledWith('Asset archived');
    });
  });

  it('returns title validation errors from rename', async () => {
    updateAsset.mockRejectedValue(
      new ApiError(400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        details: [{ field: 'title', errors: ['Title is required.'] }],
      }),
    );
    const { result } = renderHook(() => useRenameAsset(), { wrapper: createWrapper() });

    let message: string | null = null;
    await act(async () => {
      message = await result.current.renameAsset('asset-1', '');
    });

    expect(message).toBe('Title is required.');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('reports delete errors and resolves false', async () => {
    deleteAsset.mockRejectedValue(new ApiError(409, 'In use', { code: 'RESOURCE_IN_USE' }));
    const { result } = renderHook(() => useDeleteAssetAction(), { wrapper: createWrapper() });

    let deleted = true;
    await act(async () => {
      deleted = await result.current.removeAsset('asset-1');
    });

    expect(deleted).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      'This asset is used in lessons. Remove it from them first.',
      { id: 'asset-delete-failed' },
    );
  });
});
