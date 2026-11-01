import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';

const { fetchAsset } = vi.hoisted(() => ({ fetchAsset: vi.fn() }));

vi.mock('../api/api', () => ({ fetchAsset }));
vi.mock('../components/AssetDetailView', () => ({
  AssetDetailView: ({ asset }: { asset: { id: string } }) => <div>Asset details: {asset.id}</div>,
}));

import { AssetDetailPage } from './AssetDetailPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/assets/asset-1']}>
        <Routes>
          <Route path="/assets/:id" element={<AssetDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AssetDetailPage', () => {
  beforeEach(() => {
    fetchAsset.mockReset();
  });

  it('shows a loading state while the detail request is pending', () => {
    fetchAsset.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading asset' })).toBeInTheDocument();
  });

  it('shows a specific not-found message', async () => {
    fetchAsset.mockRejectedValue(new ApiError(404, 'Not found', { code: 'NOT_FOUND' }));

    renderPage();

    expect(await screen.findByText('Asset not found.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders the detail view after a successful response', async () => {
    fetchAsset.mockResolvedValue({
      id: 'asset-1',
      type: 'IMAGE',
      title: 'Diagram',
      status: 'ACTIVE',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      file: null,
      usedIn: { total: 0, items: [] },
    });

    renderPage();

    expect(await screen.findByText('Asset details: asset-1')).toBeInTheDocument();
  });
});
