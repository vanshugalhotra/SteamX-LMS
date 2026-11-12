import { useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/api-errors';
import { RICH_TEXT_EXTENSIONS } from './rich-text-extensions';

interface LessonBlock {
  id: string;
  type: string;
  assetId?: string;
  content: Record<string, unknown>;
  columns?: [LessonBlock | null, LessonBlock | null];
}

interface LessonAsset {
  id: string;
  title: string;
  status?: string;
  file?: { status: string } | null;
}

interface AssetUrlQuery {
  data?: { url: string };
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

type UseAssetUrl = (assetId: string) => AssetUrlQuery;

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const PROSE_CLASS =
  'text-sm leading-7 [&_.ProseMirror]:outline-none [&_h1]:text-2xl [&_h1]:font-bold ' +
  '[&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-brand-line [&_blockquote]:pl-4 ' +
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 ' +
  '[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-gray-100 [&_pre]:p-3 ' +
  '[&_a]:text-primary [&_a]:underline';

function getDocument(value: unknown): JSONContent {
  if (typeof value !== 'object' || value === null || !('type' in value)) return EMPTY_DOC;
  return value as JSONContent;
}

function getString(content: Record<string, unknown>, key: string) {
  const value = content[key];
  return typeof value === 'string' ? value : '';
}

function RichTextView({ value }: { value: unknown }) {
  const editor = useEditor({
    extensions: RICH_TEXT_EXTENSIONS,
    content: getDocument(value),
    editable: false,
    editorProps: { attributes: { 'aria-label': 'Lesson text' } },
  });

  return (
    <article className={PROSE_CLASS}>
      <EditorContent editor={editor} />
    </article>
  );
}

function AssetBlockView({
  block,
  asset,
  useAssetUrl,
}: {
  block: LessonBlock;
  asset: LessonAsset | undefined;
  useAssetUrl: UseAssetUrl;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const assetId = block.assetId ?? '';
  const archived = asset?.status === 'ARCHIVED';
  const notReady = asset?.file !== undefined && asset.file?.status !== 'READY';
  const ready = Boolean(assetId) && !archived && !notReady;
  const access = useAssetUrl(ready ? assetId : '');
  // TODO: Refresh signed URLs on expiry.
  const url = access.data?.url;
  const caption = getString(block.content, 'caption');

  if (!assetId) return <p className="text-sm text-gray-600">No file chosen.</p>;
  if (archived) return <p className="text-sm text-gray-600">This file has been archived.</p>;
  if (notReady) return <p className="text-sm text-gray-600">This file is not ready to preview.</p>;

  if (access.isError || (url !== undefined && failedUrl === url)) {
    return (
      <div className="space-y-3">
        <Alert>
          {access.isError ? getErrorMessage(access.error) : "The preview couldn't be loaded."}
        </Alert>
        <Button
          type="button"
          variant="secondary"
          disabled={access.isFetching}
          onClick={() => {
            setFailedUrl(null);
            void access.refetch();
          }}
        >
          Retry preview
        </Button>
      </div>
    );
  }

  if (url === undefined) {
    return (
      <div
        className="grid min-h-48 place-items-center rounded-2xl bg-gray-100"
        role="status"
        aria-live="polite"
        aria-label="Loading lesson file"
      >
        {(access.isPending || access.isFetching) && <Spinner />}
        {!access.isPending && !access.isFetching && (
          <p className="text-sm text-gray-600">Preview unavailable.</p>
        )}
      </div>
    );
  }

  const onMediaError = () => {
    setFailedUrl(url);
  };
  const figcaption = caption ? (
    <figcaption className="mt-2 text-sm text-gray-600">{caption}</figcaption>
  ) : null;

  if (block.type === 'IMAGE') {
    return (
      <figure>
        <img
          src={url}
          alt={getString(block.content, 'alt')}
          loading="lazy"
          onError={onMediaError}
          className="mx-auto max-h-168 w-auto max-w-full rounded-xl object-contain"
        />
        {figcaption}
      </figure>
    );
  }

  if (block.type === 'VIDEO') {
    return (
      <figure>
        <video
          src={url}
          controls
          preload="metadata"
          onError={onMediaError}
          className="aspect-video w-full rounded-2xl bg-black"
        />
        {figcaption}
      </figure>
    );
  }

  return (
    <figure className="rounded-2xl border border-brand-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{asset?.title ?? 'PDF document'}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-brand-line px-3 py-2 text-sm font-medium outline-none hover:bg-brand-side focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open PDF
        </a>
      </div>
      {figcaption}
    </figure>
  );
}

function LessonBlockView({
  block,
  assets,
  useAssetUrl,
}: {
  block: LessonBlock;
  assets: Record<string, LessonAsset | undefined>;
  useAssetUrl: UseAssetUrl;
}) {
  switch (block.type) {
    case 'RICH_TEXT':
      return <RichTextView value={block.content.doc} />;
    case 'ACCORDION': {
      const body = block.content.body;
      const bodyDoc =
        typeof body === 'object' && body !== null && 'doc' in body ? body.doc : undefined;
      const title = getString(block.content, 'title') || 'More information';
      return (
        <details className="rounded-2xl border border-brand-line px-4 py-3">
          <summary className="cursor-pointer rounded-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {title}
          </summary>
          <div className="pt-3">
            <RichTextView value={bodyDoc} />
          </div>
        </details>
      );
    }
    case 'TWO_COLUMN':
      return (
        <div className="grid gap-6 md:grid-cols-2">
          {(block.columns ?? [null, null]).map((child, index) => (
            <section key={index} aria-label={`Column ${String(index + 1)}`} className="min-w-0">
              {child && <LessonBlockView block={child} assets={assets} useAssetUrl={useAssetUrl} />}
            </section>
          ))}
        </div>
      );
    case 'IMAGE':
    case 'VIDEO':
    case 'PDF':
      return (
        <AssetBlockView
          block={block}
          asset={block.assetId ? assets[block.assetId] : undefined}
          useAssetUrl={useAssetUrl}
        />
      );
    default:
      return (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
          This content block can’t be previewed.
        </p>
      );
  }
}

export function LessonContentView({
  blocks,
  assets,
  useAssetUrl,
}: {
  blocks: LessonBlock[];
  assets: Record<string, LessonAsset | undefined>;
  useAssetUrl: UseAssetUrl;
}) {
  return (
    <section aria-label="Lesson preview" className="mx-auto max-w-4xl space-y-8">
      {blocks.length === 0 ? (
        <p className="rounded-2xl bg-gray-50 p-6 text-center text-sm text-gray-600">
          This lesson is empty.
        </p>
      ) : (
        blocks.map((block) => (
          <LessonBlockView key={block.id} block={block} assets={assets} useAssetUrl={useAssetUrl} />
        ))
      )}
    </section>
  );
}
