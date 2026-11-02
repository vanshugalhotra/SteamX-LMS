import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { getErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import { getAssetPresentation } from '../config/assets.config';
import { canPreview, previewUnavailableMessage } from '../model/asset-rules';
import type { AssetDetail } from '../model/types';
import { useAssetAccess } from '../queries';

type PreviewAsset = Pick<AssetDetail, 'id' | 'type' | 'title' | 'file'>;

export function AssetPreview({ asset }: { asset: PreviewAsset }) {
  const ready = canPreview(asset.file?.status, asset.type);
  const access = useAssetAccess(ready ? asset.id : '');
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { refetch } = access;
  const expiresAt = access.data?.expiresAt;

  // The URL is short-lived: fetch a fresh one shortly before it expires.
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(Date.parse(expiresAt) - Date.now() - 30_000, 5_000);
    const timer = window.setTimeout(() => void refetch(), delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [expiresAt, refetch]);

  const presentation = getAssetPresentation(asset.type, asset.file?.mimeType);
  const Icon = presentation.icon;

  if (!ready) {
    return (
      <div
        className={cn('grid min-h-56 place-items-center rounded-3xl p-6', presentation.className)}
      >
        <div className="text-center">
          <Icon className="mx-auto size-10" aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold">
            {previewUnavailableMessage(asset.file?.status, asset.type)}
          </p>
        </div>
      </div>
    );
  }

  const url = access.data?.url;
  const mediaFailed = url !== undefined && failedUrl === url;

  if (access.isError || mediaFailed) {
    return (
      <div className="space-y-3 rounded-3xl bg-gray-50 p-5">
        <Alert>
          {access.isError ? getErrorMessage(access.error) : "The preview couldn't be loaded."}
        </Alert>
        <Button variant="secondary" disabled={access.isFetching} onClick={() => void refetch()}>
          Reload preview
        </Button>
      </div>
    );
  }

  if (url === undefined) {
    return (
      <div
        className="h-56 animate-pulse rounded-3xl bg-gray-100"
        role="status"
        aria-label="Loading preview"
      />
    );
  }

  const onError = () => {
    setFailedUrl(url);
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-gray-50 p-3">
      {asset.type === 'IMAGE' && (
        <img
          key={url}
          src={url}
          alt={asset.title}
          onError={onError}
          className="mx-auto max-h-96 w-auto max-w-full rounded-2xl object-contain"
        />
      )}
      {asset.type === 'VIDEO' && (
        <video
          key={url}
          src={url}
          controls
          preload="metadata"
          onError={onError}
          className="w-full rounded-2xl bg-black"
        />
      )}
      {asset.type === 'PDF' && (
        <div className="grid min-h-40 place-items-center">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'secondary' })}
          >
            Open PDF in a new tab
          </a>
        </div>
      )}
    </div>
  );
}
