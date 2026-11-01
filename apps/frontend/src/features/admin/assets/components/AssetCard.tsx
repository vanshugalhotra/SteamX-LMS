import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  FILE_STATUS_PRESENTATION,
  formatAssetDate,
  formatAssetSize,
  IMAGE_MIME_PRESENTATION,
  TYPE_PRESENTATION,
} from '../config/assets.config';
import type { Asset } from '../model/types';

export function AssetCard({ asset }: { asset: Asset }) {
  const mimeType = asset.file?.mimeType?.toLowerCase();
  const presentation =
    asset.type === 'IMAGE' && mimeType
      ? (IMAGE_MIME_PRESENTATION[mimeType] ?? TYPE_PRESENTATION[asset.type])
      : TYPE_PRESENTATION[asset.type];
  const TypeIcon = presentation.icon;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-3xl bg-white shadow-md">
      <div
        className={cn(
          'relative grid h-36 place-items-center overflow-hidden',
          presentation.className,
        )}
      >
        <span
          aria-hidden="true"
          className="absolute -left-5 top-8 size-20 rounded-full bg-white/25"
        />
        <span
          aria-hidden="true"
          className="absolute -right-3 -top-4 size-14 rounded-full bg-white/20"
        />
        <div className="relative text-center">
          <TypeIcon className="mx-auto size-10" aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold">{presentation.label}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold" title={asset.title}>
            {asset.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-600">
            {formatAssetSize(asset.file?.sizeBytes ?? null)}
            {', created '}
            {formatAssetDate(asset.createdAt)}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {asset.file ? (
            <Badge variant={FILE_STATUS_PRESENTATION[asset.file.status].variant}>
              {FILE_STATUS_PRESENTATION[asset.file.status].label}
            </Badge>
          ) : (
            <Badge variant="neutral">No file</Badge>
          )}
          <Badge variant={asset.status === 'ACTIVE' ? 'neutral' : 'warning'}>
            {asset.status === 'ACTIVE' ? 'Active' : 'Archived'}
          </Badge>
        </div>
        {/* TODO: Will confirm these colors with @shreya against the reference design. */}
        {/* TODO: Add a replace-file button to the asset card. */}
      </div>
    </article>
  );
}
