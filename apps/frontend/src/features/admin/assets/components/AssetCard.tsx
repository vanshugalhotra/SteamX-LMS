import { FileText, Image as ImageIcon, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Asset, AssetFileStatus, AssetType } from '../model/types';
import { formatAssetDate, formatAssetSize } from '../config/assets.config';

const TYPE_PRESENTATION: Record<
  AssetType,
  { label: string; className: string; icon: typeof ImageIcon }
> = {
  IMAGE: { label: 'Image', className: 'bg-teal-500 text-gray-900', icon: ImageIcon },
  VIDEO: { label: 'MP4', className: 'bg-gray-900 text-white', icon: Play },
  PDF: { label: 'PDF', className: 'bg-magenta-800 text-white', icon: FileText },
  PPTX: { label: 'Unsupported type', className: 'bg-gray-600 text-white', icon: FileText },
};

const FILE_STATUS_PRESENTATION: Record<
  AssetFileStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  UPLOADING: { label: 'Uploading', variant: 'warning' },
  UPLOADED: { label: 'Uploaded', variant: 'warning' },
  PROCESSING: { label: 'Processing', variant: 'warning' },
  READY: { label: 'Ready', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
};

export function AssetCard({ asset }: { asset: Asset }) {
  const mimeType = asset.file?.mimeType?.toLowerCase();
  const presentation =
    asset.type === 'IMAGE' && mimeType === 'image/jpeg'
      ? { label: 'JPG', className: 'bg-coral-500 text-gray-900', icon: ImageIcon }
      : asset.type === 'IMAGE' && mimeType === 'image/webp'
        ? { label: 'WebP', className: 'bg-yellow-500 text-gray-900', icon: ImageIcon }
        : asset.type === 'IMAGE' && mimeType === 'image/png'
          ? { label: 'PNG', className: 'bg-teal-500 text-gray-900', icon: ImageIcon }
          : TYPE_PRESENTATION[asset.type];
  const TypeIcon = presentation.icon;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-3xl bg-white shadow-md">
      <div
        className={`relative grid h-36 place-items-center overflow-hidden ${presentation.className}`}
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
      </div>
    </article>
  );
}
