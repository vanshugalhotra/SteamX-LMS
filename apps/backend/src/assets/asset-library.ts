import { AssetFileStatus } from '../generated/prisma/client.js';
import type { AssetFileSelection } from './dto/asset-file-selection.js';

/** READY is the serving file; before one exists, the newest upload attempt is current. */
export function pickCurrentFile(files: AssetFileSelection[]): AssetFileSelection | null {
  const readyFile = files.find((file) => file.status === AssetFileStatus.READY);
  if (readyFile) {
    return readyFile;
  }

  return (
    [...files].sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
    )[0] ?? null
  );
}
