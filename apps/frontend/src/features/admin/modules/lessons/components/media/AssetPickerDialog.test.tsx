import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Asset } from '@/features/admin/assets/model/types';
import { AssetPickerDialog } from './AssetPickerDialog';

const { useAssets } = vi.hoisted(() => ({ useAssets: vi.fn() }));
vi.mock('@/features/admin/assets/queries', () => ({ useAssets }));

const handout: Asset = {
  id: 'asset-1',
  type: 'PDF',
  title: 'Handout',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
  file: {
    id: 'file-1',
    status: 'READY',
    lastError: null,
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    originalFilename: 'handout.pdf',
  },
};

function renderPicker(items: Asset[] = [handout]) {
  useAssets.mockReturnValue({
    data: { items, page: 1, limit: 24, total: items.length },
    isPending: false,
    error: null,
  });
  const onSelect = vi.fn();
  render(<AssetPickerDialog assetType="PDF" label="PDF" onSelect={onSelect} onClose={vi.fn()} />);
  return { onSelect };
}

it('asks only for active, ready assets of the block type', () => {
  renderPicker();
  expect(useAssets).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PDF', status: 'ACTIVE', fileStatus: 'READY' }),
  );
});

it('returns the chosen asset', async () => {
  const user = userEvent.setup();
  const { onSelect } = renderPicker();
  const confirm = screen.getByRole('button', { name: 'Use PDF' });
  expect(confirm).toBeDisabled();
  await user.click(screen.getByRole('button', { name: /Handout/ }));
  await user.click(confirm);
  expect(onSelect).toHaveBeenCalledWith(handout);
});

it('explains when nothing matches', () => {
  renderPicker([]);
  expect(screen.getByText(/No matching files/)).toBeInTheDocument();
});
