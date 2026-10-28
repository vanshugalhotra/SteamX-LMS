import type { AssetFile, AssetType } from '../../generated/prisma/client.js';

/** Per-type contract for processing an uploaded original into serving metadata. */
export interface AssetProcessor {
  readonly type: AssetType;
  /** Returns the playback object key, or null when this file type has no separate playback object. */
  process(file: AssetFile): Promise<{ playbackKey: string | null }>;
}
