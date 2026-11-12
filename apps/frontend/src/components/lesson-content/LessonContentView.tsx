import { useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { ChevronDown, FileText, Image as ImageIcon, Play, Video } from 'lucide-react';
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
  file?: { status: string; originalFilename?: string | null } | null;
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
  'min-w-0 max-w-full break-words text-sm leading-7 [&_.ProseMirror]:min-w-0 [&_.ProseMirror]:outline-none [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-tight sm:[&_h1]:text-2xl ' +
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
    <article className={`w-full max-w-3xl ${PROSE_CLASS}`}>
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
  const [videoStarted, setVideoStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const assetId = block.assetId ?? '';
  const archived = asset?.status === 'ARCHIVED';
  const notReady = asset?.file !== undefined && asset.file?.status !== 'READY';
  const ready = Boolean(assetId) && !archived && !notReady;
  const access = useAssetUrl(ready ? assetId : '');
  // TODO: Refresh signed URLs on expiry.
  const url = access.data?.url;
  const caption = getString(block.content, 'caption');
  const PreviewIcon =
    block.type === 'IMAGE' ? ImageIcon : block.type === 'VIDEO' ? Video : FileText;

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
        className="grid min-h-48 place-items-center rounded-2xl bg-brand-side"
        role="status"
        aria-live="polite"
        aria-label="Loading lesson file"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-coral/15 text-brand-coral">
            <PreviewIcon className="size-7" aria-hidden="true" />
          </span>
          {(access.isPending || access.isFetching) && <Spinner />}
          {!access.isPending && !access.isFetching && (
            <p className="text-sm text-gray-600">Preview unavailable.</p>
          )}
        </div>
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
          className="mx-auto max-h-96 w-full max-w-3xl rounded-xl object-contain"
        />
        {figcaption}
      </figure>
    );
  }

  if (block.type === 'VIDEO') {
    return (
      <figure>
        <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-brand-navy">
          <video
            ref={videoRef}
            src={url}
            controls={videoStarted}
            preload="metadata"
            muted
            playsInline
            onError={onMediaError}
            onPlay={() => {
              setVideoStarted(true);
            }}
            className="aspect-video w-full bg-brand-navy"
          />
          {!videoStarted && (
            <button
              type="button"
              aria-label="Play video"
              className="absolute inset-0 grid place-items-center bg-transparent outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/70"
              onClick={() => {
                setVideoStarted(true);
                void videoRef.current?.play().catch(() => {
                  setVideoStarted(false);
                });
              }}
            >
              <span className="grid size-14 place-items-center rounded-full bg-brand-coral text-white shadow-lg">
                <Play className="ml-1 size-6 fill-current" aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
        {figcaption}
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-2xl border border-brand-line bg-brand-side">
      <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-coral text-white">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{asset?.title ?? 'PDF document'}</p>
          <p className="mt-0.5 text-xs text-gray-600">
            PDF{asset?.file?.originalFilename ? ` · ${asset.file.originalFilename}` : ''}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-brand-coral px-4 py-2.5 text-xs font-semibold text-white outline-none hover:bg-coral-700 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open PDF
        </a>
      </div>
      {caption && (
        <figcaption className="border-t border-brand-line px-4 py-3 text-sm text-gray-600 sm:px-5">
          {caption}
        </figcaption>
      )}
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
        <details className="group/accordion min-w-0 rounded-2xl border border-brand-line px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg font-medium outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{title}</span>
            <ChevronDown
              className="size-3.5 shrink-0 transition-transform group-open/accordion:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="pt-3">
            <RichTextView value={bodyDoc} />
          </div>
        </details>
      );
    }
    case 'TWO_COLUMN':
      return (
        <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 rounded-2xl bg-brand-side p-3 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {(block.columns ?? [null, null]).map((child, index) => (
            <section
              key={index}
              aria-label={`Column ${String(index + 1)}`}
              className="min-w-0 p-1 sm:p-2"
            >
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
    <section aria-label="Lesson preview" className="w-full min-w-0 max-w-full space-y-8">
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
