import { Module } from '@nestjs/common';
import { AssetType } from '../../generated/prisma/client.js';
import {
  AssetProcessorRegistry,
  ASSET_PROCESSORS,
  IMAGE_ASSET_PROCESSOR,
  PDF_ASSET_PROCESSOR,
} from './asset-processor.registry.js';
import {
  NoPlaybackAssetProcessor,
  VideoPassthroughAssetProcessor,
} from './passthrough-asset-processors.js';

/** Registers one processor per supported type and exposes the lookup registry. */
@Module({
  providers: [
    {
      provide: IMAGE_ASSET_PROCESSOR,
      useFactory: () => new NoPlaybackAssetProcessor(AssetType.IMAGE),
    },
    {
      provide: PDF_ASSET_PROCESSOR,
      useFactory: () => new NoPlaybackAssetProcessor(AssetType.PDF),
    },
    VideoPassthroughAssetProcessor,
    {
      provide: ASSET_PROCESSORS,
      // Each provider token identifies one processor instance; the registry validates the combined set.
      useFactory: (
        imageProcessor: NoPlaybackAssetProcessor,
        pdfProcessor: NoPlaybackAssetProcessor,
        videoProcessor: VideoPassthroughAssetProcessor,
      ) => [imageProcessor, pdfProcessor, videoProcessor],
      inject: [IMAGE_ASSET_PROCESSOR, PDF_ASSET_PROCESSOR, VideoPassthroughAssetProcessor],
    },
    AssetProcessorRegistry,
  ],
  exports: [AssetProcessorRegistry],
})
export class AssetProcessingModule {}
