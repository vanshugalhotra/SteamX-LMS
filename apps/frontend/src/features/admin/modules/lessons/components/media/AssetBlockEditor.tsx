import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { useAssetAccess } from '@/features/admin/assets/queries';
import type { Asset } from '@/features/admin/assets/model/types';
import { ImageIcon, Play } from 'lucide-react';
import { getErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import { BLOCK_TEXT_MAX_LENGTH } from '../../config/lessons.config';
import { BLOCK_META, getBlockField, type BlockTextField } from '../../model/blocks';
import type { LessonContentAsset, LessonContentBlock } from '../../model/types';
import { AssetPickerDialog } from './AssetPickerDialog';
import { describeFile } from './file-display';
import { AssetThumb } from './AssetThumb';

// Existing references may stay after archiving or losing the file; flag them.
function assetNote(asset: LessonContentAsset): string | null {
  if (asset.status === 'ARCHIVED') return 'Archived';
  return asset.file?.status === 'READY' ? null : 'File not ready';
}

export function AssetBlockEditor({
  block,
  asset,
  invalid,
  disabled,
  onPick,
  onFieldChange,
}: {
  block: LessonContentBlock;
  asset: LessonContentAsset | undefined;
  invalid: boolean;
  disabled: boolean;
  onPick: (asset: Asset) => void;
  onFieldChange: (key: BlockTextField, value: string) => void;
}) {
  const id = useId();
  const [picking, setPicking] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const meta = BLOCK_META[block.type];
  const previewAssetId =
    (block.type === 'IMAGE' || block.type === 'VIDEO') &&
    asset?.status === 'ACTIVE' &&
    asset.file?.status === 'READY'
      ? asset.id
      : '';
  const previewReady = previewAssetId !== '';
  const access = useAssetAccess(previewAssetId);
  if (!meta?.assetType) return null;

  const note = asset ? assetNote(asset) : null;
  const errorId = `${id}-error`;
  const previewUrl = access.data?.url;
  const previewLoaded =
    previewUrl !== undefined && loadedPreviewUrl === previewUrl && failedPreviewUrl !== previewUrl;
  const openPicker = () => {
    setPicking(true);
  };

  return (
    <div className="space-y-3">
      {(asset?.type === 'IMAGE' || asset?.type === 'VIDEO') && (
        <div className="relative grid aspect-16/5 min-h-32 max-h-60 place-items-center overflow-hidden rounded-2xl">
          <div
            data-thumbnail-fallback
            aria-hidden="true"
            className={`absolute inset-0 grid place-items-center bg-brand-side ${
              previewLoaded ? 'hidden' : ''
            }`}
          >
            {asset.type === 'VIDEO' ? (
              <Play className="size-10 fill-current text-brand-navy" />
            ) : (
              <ImageIcon className="size-10 text-brand-navy" />
            )}
          </div>
          {asset.type === 'IMAGE' && previewUrl && failedPreviewUrl !== previewUrl && (
            <img
              src={previewUrl}
              alt=""
              loading="lazy"
              onLoad={() => {
                setLoadedPreviewUrl(previewUrl);
              }}
              onError={() => {
                setFailedPreviewUrl(previewUrl);
              }}
              className={`absolute inset-0 size-full object-contain transition-opacity ${
                previewLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
          {asset.type === 'VIDEO' && previewUrl && failedPreviewUrl !== previewUrl && (
            <video
              src={previewUrl}
              aria-label={`${asset.title} thumbnail`}
              preload="metadata"
              muted
              playsInline
              onLoadedData={() => {
                setLoadedPreviewUrl(previewUrl);
              }}
              onError={() => {
                setFailedPreviewUrl(previewUrl);
              }}
              className={`absolute inset-0 size-full object-contain transition-opacity ${
                previewLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
        </div>
      )}
      {asset ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-line bg-brand-side/50 p-3">
          <AssetThumb
            type={asset.type}
            mimeType={asset.file?.mimeType}
            className={asset.type === 'IMAGE' ? 'size-14' : 'size-11'}
          />
          <p className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{asset.title}</span>
            <span className="block truncate text-[11px] text-gray-600">
              {describeFile(asset.file)}
            </span>
          </p>
          {note && <Badge variant="neutral">{note}</Badge>}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={openPicker}
          >
            Replace
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'rounded-2xl border-2 border-dashed p-5 text-center',
            invalid ? 'border-danger-line bg-danger-soft' : 'border-brand-line',
          )}
        >
          <p className="mb-2 text-xs font-medium">No {meta.label} chosen</p>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            aria-describedby={invalid ? errorId : undefined}
            onClick={openPicker}
          >
            Choose from Asset Library
          </Button>
          {invalid && (
            <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-danger">
              Choose a file to save this block.
            </p>
          )}
        </div>
      )}
      {previewReady &&
        (access.isError || (previewUrl !== undefined && failedPreviewUrl === previewUrl)) && (
          <div className="space-y-2">
            <Alert>
              {access.isError
                ? getErrorMessage(access.error)
                : `The ${block.type === 'VIDEO' ? 'video' : 'image'} thumbnail couldn't be loaded.`}
            </Alert>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={access.isFetching}
              onClick={() => {
                setFailedPreviewUrl(null);
                void access.refetch();
              }}
            >
              Retry thumbnail
            </Button>
          </div>
        )}
      {meta.fields?.map(({ key, label }) => (
        <div key={key}>
          <label htmlFor={`${id}-${key}`} className="mb-1 block text-xs font-medium">
            {label}
          </label>
          <Input
            id={`${id}-${key}`}
            maxLength={BLOCK_TEXT_MAX_LENGTH}
            readOnly={disabled}
            value={getBlockField(block, key)}
            onChange={(event) => {
              onFieldChange(key, event.target.value);
            }}
          />
        </div>
      ))}
      {picking && (
        <AssetPickerDialog
          assetType={meta.assetType}
          label={meta.label}
          onSelect={onPick}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
