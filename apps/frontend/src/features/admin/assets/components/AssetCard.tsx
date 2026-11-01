import { Archive, ArchiveRestore } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import {
  FILE_STATUS_PRESENTATION,
  formatAssetDate,
  formatAssetSize,
  getAssetPresentation,
} from '../config/assets.config';
import { statusActionLabel } from '../model/asset-rules';
import type { Asset } from '../model/types';

interface AssetCardProps {
  asset: Asset;
  onToggleStatus: (asset: Asset) => void;
  statusPending: boolean;
}

export function AssetCard({ asset, onToggleStatus, statusPending }: AssetCardProps) {
  const presentation = getAssetPresentation(asset.type, asset.file?.mimeType);
  const TypeIcon = presentation.icon;
  const ToggleIcon = asset.status === 'ACTIVE' ? Archive : ArchiveRestore;
  const toggleLabel = statusActionLabel(asset.status);

  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-3xl bg-white shadow-md focus-within:ring-2 focus-within:ring-ring/40">
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
            {/* The link is stretched over the whole card. */}
            <Link
              to={PATHS.admin.assetView(asset.id)}
              className="outline-none after:absolute after:inset-0"
            >
              {asset.title}
            </Link>
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
          <button
            type="button"
            disabled={statusPending}
            onClick={() => {
              onToggleStatus(asset);
            }}
            aria-label={`${toggleLabel} ${asset.title}`}
            className="relative z-10 ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-600 outline-none hover:bg-gray-100 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            <ToggleIcon className="size-3.5" aria-hidden="true" />
            {toggleLabel}
          </button>
        </div>
        {/* TODO: Will confirm these colors with @shreya against the reference design. */}
      </div>
    </article>
  );
}
