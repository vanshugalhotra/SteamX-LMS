import { formatAssetSize } from '@/features/admin/assets/config/assets.config';

/** "diagram.png · 1 MB" for an asset's current file (empty when it has none). */
export function describeFile(
  file: { originalFilename: string | null; sizeBytes: number | null } | null,
): string {
  if (!file) return '';
  return [file.originalFilename, formatAssetSize(file.sizeBytes)].filter(Boolean).join(' · ');
}
