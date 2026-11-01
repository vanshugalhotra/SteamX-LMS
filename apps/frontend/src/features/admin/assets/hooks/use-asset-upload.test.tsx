import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAsset, requestAssetFileUpload, completeAssetFileUpload, putAssetFile } = vi.hoisted(
  () => ({
    createAsset: vi.fn(),
    requestAssetFileUpload: vi.fn(),
    completeAssetFileUpload: vi.fn(),
    putAssetFile: vi.fn(),
  }),
);

vi.mock('../api/api', () => ({
  createAsset,
  requestAssetFileUpload,
  completeAssetFileUpload,
}));

vi.mock('../api/put-asset-file', () => ({
  AssetPutError: class AssetPutError extends Error {},
  putAssetFile,
}));

import { useAssetUpload } from './use-asset-upload';

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

const replacementRequest = {
  asset: {
    id: 'asset-1',
    type: 'IMAGE',
    title: 'Diagram',
    status: 'ACTIVE',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    file: null,
  },
  file: {
    id: 'file-2',
    assetId: 'asset-1',
    status: 'UPLOADING',
    originalFilename: 'new.png',
    mimeType: 'image/png',
    sizeBytes: 16,
    lastError: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  upload: {
    url: 'https://storage.example/upload',
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
};

describe('useAssetUpload replacement mode', () => {
  beforeEach(() => {
    createAsset.mockReset();
    requestAssetFileUpload.mockReset();
    completeAssetFileUpload.mockReset();
    putAssetFile.mockReset();
    requestAssetFileUpload.mockResolvedValue(replacementRequest);
    completeAssetFileUpload.mockResolvedValue({ ...replacementRequest.file, status: 'READY' });
    putAssetFile.mockImplementation(
      (_upload: unknown, _file: File, onProgress: (value: number) => void) => ({
        promise: Promise.resolve().then(() => {
          onProgress(100);
        }),
        abort: vi.fn(),
      }),
    );
  });

  it('requests a replacement, uploads it, and completes without creating an asset', async () => {
    const { result } = renderHook(
      () => useAssetUpload({ existingAsset: { id: 'asset-1', type: 'IMAGE' } }),
      { wrapper: createWrapper() },
    );
    const signature = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const file = new File([signature], 'new.png', { type: 'image/png' });

    await act(async () => {
      await result.current.chooseFile(file);
    });
    await act(async () => {
      await result.current.startUpload();
    });

    await waitFor(() => {
      expect(result.current.phase).toBe('ready');
    });
    expect(requestAssetFileUpload).toHaveBeenCalledWith('asset-1', {
      filename: 'new.png',
      mimeType: 'image/png',
      sizeBytes: 16,
    });
    expect(putAssetFile).toHaveBeenCalledWith(
      replacementRequest.upload,
      file,
      expect.any(Function),
    );
    expect(completeAssetFileUpload).toHaveBeenCalledWith('asset-1', 'file-2');
    expect(createAsset).not.toHaveBeenCalled();
  });

  it('rejects a replacement whose type differs from the asset', async () => {
    const { result } = renderHook(
      () => useAssetUpload({ existingAsset: { id: 'asset-1', type: 'IMAGE' } }),
      { wrapper: createWrapper() },
    );
    const file = new File(['%PDF-1.7 12345678'], 'new.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.chooseFile(file);
    });

    expect(result.current.fileError).toBe(
      'The file must be the same type as the asset. Choose another file or cancel.',
    );
    expect(result.current.validatedFile).toBeNull();
    expect(requestAssetFileUpload).not.toHaveBeenCalled();
  });
});
