import { FileText, Image as ImageIcon, Play } from 'lucide-react';
import type { AssetFileStatus, AssetStatus, AssetType } from '../model/types';
import type { ErrorOverrides } from '@/lib/api-errors';

export const ASSETS_PAGE_SIZE = 12;
export const ASSETS_SEARCH_MAX_LENGTH = 100;

export const TYPE_PRESENTATION: Record<
  AssetType,
  { label: string; className: string; icon: typeof ImageIcon }
> = {
  IMAGE: { label: 'Image', className: 'bg-teal-500 text-gray-900', icon: ImageIcon },
  VIDEO: { label: 'MP4', className: 'bg-gray-900 text-white', icon: Play },
  PDF: { label: 'PDF', className: 'bg-magenta-800 text-white', icon: FileText },
  PPTX: { label: 'Unsupported type', className: 'bg-gray-600 text-white', icon: FileText },
};

type AssetPresentation = (typeof TYPE_PRESENTATION)[AssetType];

export const IMAGE_MIME_PRESENTATION: Record<string, AssetPresentation> = {
  'image/jpeg': { label: 'JPG', className: 'bg-coral-500 text-gray-900', icon: ImageIcon },
  'image/webp': { label: 'WebP', className: 'bg-yellow-500 text-gray-900', icon: ImageIcon },
  'image/png': { label: 'PNG', className: 'bg-teal-500 text-gray-900', icon: ImageIcon },
};

export const FILE_STATUS_PRESENTATION: Record<
  AssetFileStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  UPLOADING: { label: 'Uploading', variant: 'warning' },
  UPLOADED: { label: 'Uploaded', variant: 'warning' },
  PROCESSING: { label: 'Processing', variant: 'warning' },
  READY: { label: 'Ready', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
};

export type AssetTypeFilter = Exclude<AssetType, 'PPTX'> | 'ALL';

export const ASSET_TYPE_FILTERS = [
  { value: 'ALL', label: 'All types' },
  { value: 'IMAGE', label: 'Images', indicatorClassName: 'bg-teal-500' },
  { value: 'VIDEO', label: 'Videos', indicatorClassName: 'bg-gray-900' },
  { value: 'PDF', label: 'PDF', indicatorClassName: 'bg-magenta-800' },
] satisfies {
  value: AssetTypeFilter;
  label: string;
  indicatorClassName?: string;
}[];

export function isAssetTypeFilter(value: string): value is AssetTypeFilter {
  return value === 'ALL' || value === 'IMAGE' || value === 'VIDEO' || value === 'PDF';
}

export const ASSET_STATUS_FILTERS: { value: AssetStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function formatAssetSize(sizeBytes: number | null): string {
  if (sizeBytes === null) return 'Size unavailable';
  if (sizeBytes < 1_000) return `${String(sizeBytes)} B`;
  if (sizeBytes < 1_000_000) return `${String(Math.round(sizeBytes / 1_000))} KB`;
  if (sizeBytes < 1_000_000_000) return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

export function formatAssetDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}

export function getAssetPresentation(type: AssetType, mimeType: string | null | undefined) {
  const mime = mimeType?.toLowerCase();
  if (type === 'IMAGE' && mime) return IMAGE_MIME_PRESENTATION[mime] ?? TYPE_PRESENTATION[type];
  return TYPE_PRESENTATION[type];
}

/** File picker filter for a replacement. Keep in sync with upload-validation.ts. */
export const ASSET_ACCEPT: Record<AssetType, string> = {
  IMAGE: '.jpg,.jpeg,.png,.webp',
  VIDEO: '.mp4',
  PDF: '.pdf',
  PPTX: '',
};

/** Asset-specific wording on top of the default messages. */
export const ASSET_ERRORS: ErrorOverrides = {
  RESOURCE_IN_USE: 'This asset is used in lessons. Remove it from them first.',
};
