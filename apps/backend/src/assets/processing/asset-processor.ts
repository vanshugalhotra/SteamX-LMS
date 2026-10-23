import type { AssetFile, AssetType } from '../../generated/prisma/client.js';

/** Per-type seam for turning an uploaded original into playback-ready metadata. */
export interface AssetProcessor {
  readonly type: AssetType;
  /** Returns the playback object key, or null when this file type has no separate playback object. */
  process(file: AssetFile): Promise<{ playbackKey: string | null }>;
}
