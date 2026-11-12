import { fireEvent, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { LessonContentAsset, LessonContentBlock } from '../../model/types';

const { useAssetAccessMock } = vi.hoisted(() => ({ useAssetAccessMock: vi.fn() }));

vi.mock('@/features/admin/assets/queries', () => ({
  useAssetAccess: useAssetAccessMock,
}));

import { AssetBlockEditor } from './AssetBlockEditor';

const readyAsset = (type: 'IMAGE' | 'VIDEO'): LessonContentAsset => ({
  id: `asset-${type.toLowerCase()}`,
  type,
  title: `${type} lesson asset`,
  status: 'ACTIVE',
  file: {
    status: 'READY',
    mimeType: type === 'IMAGE' ? 'image/png' : 'video/mp4',
    sizeBytes: 1024,
    originalFilename: `lesson.${type === 'IMAGE' ? 'png' : 'mp4'}`,
    lastError: null,
  },
});

function renderAsset(type: 'IMAGE' | 'VIDEO') {
  const asset = readyAsset(type);
  const block: LessonContentBlock = {
    id: 'block-1',
    type,
    assetId: asset.id,
    content: {},
  };
  const view = render(
    <AssetBlockEditor
      block={block}
      asset={asset}
      invalid={false}
      disabled={false}
      onPick={vi.fn()}
      onFieldChange={vi.fn()}
    />,
  );
  return { ...view, asset };
}

beforeEach(() => {
  useAssetAccessMock.mockReset();
  useAssetAccessMock.mockReturnValue({
    data: { url: 'https://example.test/preview' },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  });
});

it.each(['IMAGE', 'VIDEO'] as const)(
  'shows a static fallback until the %s thumbnail loads',
  (type) => {
    const { container } = renderAsset(type);
    const fallback = container.querySelector('[data-thumbnail-fallback]');
    expect(fallback).toHaveClass('bg-brand-side');

    if (type === 'IMAGE') {
      const image = container.querySelector('img');
      if (!image) throw new Error('Expected an image thumbnail');
      expect(image).toHaveClass('opacity-0');
      fireEvent.load(image);
      expect(image).toHaveClass('opacity-100');
      expect(fallback).toHaveClass('hidden');
      fireEvent.error(image);
      expect(container.querySelector('img')).not.toBeInTheDocument();
    } else {
      const video = container.querySelector('video');
      if (!video) throw new Error('Expected a video thumbnail');
      expect(video).toHaveAttribute('preload', 'metadata');
      expect(video).toHaveProperty('muted', true);
      expect(video).toHaveClass('opacity-0');
      fireEvent.loadedData(video);
      expect(video).toHaveClass('opacity-100');
      expect(fallback).toHaveClass('hidden');
      fireEvent.error(video);
      expect(container.querySelector('video')).not.toBeInTheDocument();
    }

    expect(fallback).not.toHaveClass('hidden');
  },
);
