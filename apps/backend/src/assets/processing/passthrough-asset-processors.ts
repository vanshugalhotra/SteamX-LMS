import { Injectable } from '@nestjs/common';
import { AssetType } from '../../generated/prisma/client.js';
import type { AssetFile } from '../../generated/prisma/client.js';
import type { SupportedAssetType } from '../asset-rules.js';
import type { AssetProcessor } from './asset-processor.js';

/** Images and PDFs are directly usable after upload and need no playback object. */
@Injectable()
export class NoPlaybackAssetProcessor implements AssetProcessor {
  constructor(readonly type: Extract<SupportedAssetType, 'IMAGE' | 'PDF'>) {}

  async process(_file: AssetFile): Promise<{ playbackKey: null }> {
    return { playbackKey: null };
  }
}

/** Current MP4 behavior: use the uploaded original as its playback object. */
@Injectable()
export class VideoPassthroughAssetProcessor implements AssetProcessor {
  readonly type = AssetType.VIDEO;

  // HLS can replace this processor and report asynchronously via processing_job_id without a schema change.
  async process(file: AssetFile): Promise<{ playbackKey: string }> {
    return { playbackKey: file.storageKey };
  }
}
