import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LessonContentView } from './LessonContentView';

const readyAsset = {
  id: 'asset-1',
  title: 'Ultrasonic diagram',
  status: 'ACTIVE',
  file: { status: 'READY' },
};
const readyAccess = {
  data: { url: 'https://example.test/asset' },
  isPending: false,
  isError: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
};

it('renders read-only rich text with safe links', async () => {
  render(
    <LessonContentView
      blocks={[
        {
          id: 'text',
          type: 'RICH_TEXT',
          content: {
            doc: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Reference',
                      marks: [{ type: 'link', attrs: { href: 'https://example.test' } }],
                    },
                  ],
                },
              ],
            },
          },
        },
      ]}
      assets={{}}
      useAssetUrl={() => readyAccess}
    />,
  );
  const link = await screen.findByRole('link', { name: 'Reference' });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByLabelText('Lesson text')).toHaveAttribute('contenteditable', 'false');
});

it('renders accordion and two-column blocks', async () => {
  render(
    <LessonContentView
      blocks={[
        {
          id: 'accordion',
          type: 'ACCORDION',
          content: {
            title: 'Common questions',
            body: {
              format: 'tiptap',
              doc: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answers' }] }],
              },
            },
          },
        },
        {
          id: 'columns',
          type: 'TWO_COLUMN',
          content: {},
          columns: [
            {
              id: 'left',
              type: 'RICH_TEXT',
              content: {
                doc: {
                  type: 'doc',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left side' }] }],
                },
              },
            },
            null,
          ],
        },
      ]}
      assets={{}}
      useAssetUrl={() => readyAccess}
    />,
  );
  expect(screen.getByText('Common questions')).toBeInTheDocument();
  const accordion = screen.getByText('Common questions').closest('summary');
  expect(accordion?.lastElementChild?.tagName.toLowerCase()).toBe('svg');
  expect(await screen.findByText('Answers')).toBeInTheDocument();
  expect(await screen.findByText('Left side')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Column 2' })).toHaveClass('min-w-0');
  expect(screen.getByRole('region', { name: 'Column 2' })).not.toHaveClass('bg-white', 'shadow-sm');
  expect(screen.getByRole('region', { name: 'Lesson preview' })).toHaveClass(
    'min-w-0',
    'max-w-full',
  );
});

it('renders unknown blocks with a neutral placeholder', () => {
  render(
    <LessonContentView
      blocks={[{ id: 'unknown', type: 'CUSTOM', content: {} }]}
      assets={{}}
      useAssetUrl={() => readyAccess}
    />,
  );
  expect(screen.getByText('This content block can’t be previewed.')).toBeInTheDocument();
});

it('renders images with optional caption and decorative empty alt text', () => {
  const { container } = render(
    <LessonContentView
      blocks={[
        {
          id: 'image',
          type: 'IMAGE',
          assetId: readyAsset.id,
          content: { alt: '', caption: 'Sensor overview' },
        },
      ]}
      assets={{ [readyAsset.id]: readyAsset }}
      useAssetUrl={() => readyAccess}
    />,
  );
  const image = container.querySelector('img');
  expect(image).not.toBeNull();
  expect(image).toHaveAttribute('alt', '');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(screen.getByText('Sensor overview')).toBeInTheDocument();
});

it('shows a video thumbnail and starts playback on request', async () => {
  const user = userEvent.setup();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const { container } = render(
    <LessonContentView
      blocks={[
        {
          id: 'video',
          type: 'VIDEO',
          assetId: readyAsset.id,
          content: { caption: 'Wiring demo' },
        },
      ]}
      assets={{ [readyAsset.id]: readyAsset }}
      useAssetUrl={() => readyAccess}
    />,
  );
  const video = container.querySelector('video');
  expect(video).toHaveAttribute('preload', 'metadata');
  expect(video).toHaveProperty('muted', true);
  expect(video).not.toHaveAttribute('controls');
  await user.click(screen.getByRole('button', { name: 'Play video' }));
  expect(play).toHaveBeenCalledOnce();
  expect(video).toHaveAttribute('controls');
  expect(screen.getByText('Wiring demo')).toBeInTheDocument();
  play.mockRestore();
});

it('renders PDF title, safe link, and caption', () => {
  const { container } = render(
    <LessonContentView
      blocks={[
        {
          id: 'pdf',
          type: 'PDF',
          assetId: readyAsset.id,
          content: { caption: 'Read this handout' },
        },
      ]}
      assets={{ [readyAsset.id]: readyAsset }}
      useAssetUrl={() => readyAccess}
    />,
  );
  const link = screen.getByRole('link', { name: 'Open PDF' });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).toHaveClass('bg-brand-coral');
  expect(container.querySelector('figure > div > span svg')).toBeInTheDocument();
  expect(screen.getByText(readyAsset.title)).toBeInTheDocument();
  expect(screen.getByText('Read this handout')).toBeInTheDocument();
});

it('shows loading and retries asset access errors', async () => {
  const user = userEvent.setup();
  const access = {
    ...readyAccess,
    data: undefined as { url: string } | undefined,
    isPending: true,
    error: null as unknown,
  };
  const { rerender } = render(
    <LessonContentView
      blocks={[{ id: 'image', type: 'IMAGE', assetId: readyAsset.id, content: {} }]}
      assets={{ [readyAsset.id]: readyAsset }}
      useAssetUrl={() => access}
    />,
  );
  const loadingPreview = screen.getByRole('status', { name: 'Loading lesson file' });
  expect(loadingPreview).toBeInTheDocument();
  expect(loadingPreview).toHaveClass('bg-brand-side');
  expect(loadingPreview).not.toHaveClass('bg-linear-to-br');
  expect(loadingPreview.querySelector('svg')).toBeInTheDocument();
  access.isPending = false;
  access.isError = true;
  access.error = new Error('Access denied');
  rerender(
    <LessonContentView
      blocks={[{ id: 'image', type: 'IMAGE', assetId: readyAsset.id, content: {} }]}
      assets={{ [readyAsset.id]: readyAsset }}
      useAssetUrl={() => access}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
  await user.click(screen.getByRole('button', { name: 'Retry preview' }));
  expect(readyAccess.refetch).toHaveBeenCalledOnce();
});

it('explains empty, archived, and not-ready asset states', () => {
  render(
    <LessonContentView
      blocks={[
        { id: 'empty', type: 'IMAGE', content: {} },
        { id: 'archived', type: 'PDF', assetId: 'old', content: {} },
        { id: 'processing', type: 'VIDEO', assetId: 'processing', content: {} },
      ]}
      assets={{
        old: { ...readyAsset, id: 'old', status: 'ARCHIVED' },
        processing: { ...readyAsset, id: 'processing', file: { status: 'PROCESSING' } },
      }}
      useAssetUrl={() => readyAccess}
    />,
  );
  expect(screen.getByText('No file chosen.')).toBeInTheDocument();
  expect(screen.getByText('This file has been archived.')).toBeInTheDocument();
  expect(screen.getByText('This file is not ready to preview.')).toBeInTheDocument();
});
