import type { AssetStatus, AssetType } from '../model/types';

export const ASSETS_PAGE_SIZE = 12;
export const ASSETS_SEARCH_MAX_LENGTH = 100;

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
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}

export function formatAssetDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}
