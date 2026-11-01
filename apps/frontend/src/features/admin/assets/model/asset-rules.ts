import type { AssetFileStatus, AssetStatus, AssetType } from './types';

const IN_FLIGHT: readonly AssetFileStatus[] = ['UPLOADED', 'PROCESSING'];
const PROCESSING_MESSAGE = 'A file is still being processed. Try again in a moment.';

export function isFileInFlight(status: AssetFileStatus | undefined): boolean {
  return status !== undefined && IN_FLIGHT.includes(status);
}

export function lessonCountLabel(count: number): string {
  return `${String(count)} lesson${count === 1 ? '' : 's'}`;
}

/** Why delete is not offered, or null when it is. The API still has the final say. */
export function deleteBlockedReason(input: {
  usedInTotal: number;
  fileStatus?: AssetFileStatus;
}): string | null {
  if (input.usedInTotal > 0) {
    const where = input.usedInTotal === 1 ? 'that lesson' : 'those lessons';
    return `Used in ${lessonCountLabel(input.usedInTotal)}. Remove it from ${where} first.`;
  }
  return isFileInFlight(input.fileStatus) ? PROCESSING_MESSAGE : null;
}

export function replaceBlockedReason(
  fileStatus?: AssetFileStatus,
  assetType?: AssetType,
): string | null {
  if (assetType === 'PPTX') return 'Replacing legacy PPTX assets is not supported.';
  return isFileInFlight(fileStatus) ? PROCESSING_MESSAGE : null;
}

export function canPreview(fileStatus?: AssetFileStatus, assetType?: AssetType): boolean {
  return fileStatus === 'READY' && assetType !== 'PPTX';
}

export function previewUnavailableMessage(
  fileStatus?: AssetFileStatus,
  assetType?: AssetType,
): string {
  if (assetType === 'PPTX') return 'Previewing legacy PowerPoint assets is not supported.';
  if (fileStatus === undefined) return 'No file has been uploaded yet.';
  if (fileStatus === 'FAILED') return 'This file failed to process, so there is no preview.';
  return 'Preview is available once processing finishes.';
}

export function nextStatus(status: AssetStatus): AssetStatus {
  return status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
}

export function statusActionLabel(status: AssetStatus): string {
  return status === 'ACTIVE' ? 'Archive' : 'Unarchive';
}
