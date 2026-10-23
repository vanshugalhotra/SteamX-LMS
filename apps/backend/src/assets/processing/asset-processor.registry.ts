import { Inject, Injectable } from '@nestjs/common';
import type { AssetType } from '../../generated/prisma/client.js';
import type { AssetProcessor } from './asset-processor.js';

export const ASSET_PROCESSORS = Symbol('ASSET_PROCESSORS');
export const IMAGE_ASSET_PROCESSOR = Symbol('IMAGE_ASSET_PROCESSOR');
export const PDF_ASSET_PROCESSOR = Symbol('PDF_ASSET_PROCESSOR');

/** Resolves a processor by content type so callers do not need type-specific branching. */
@Injectable()
export class AssetProcessorRegistry {
  private readonly processorsByType: ReadonlyMap<AssetType, AssetProcessor>;

  /** Rejects duplicate registrations at startup rather than silently picking one. */
  constructor(@Inject(ASSET_PROCESSORS) processors: readonly AssetProcessor[]) {
    const entries = processors.map((processor) => [processor.type, processor] as const);
    if (new Set(entries.map(([type]) => type)).size !== entries.length) {
      throw new Error('Asset processor types must be unique.');
    }
    this.processorsByType = new Map(entries);
  }

  /** Fails loudly if a type is added without a corresponding processor. */
  get(type: AssetType): AssetProcessor {
    const processor = this.processorsByType.get(type);
    if (!processor) {
      throw new Error(`No asset processor registered for type "${type}".`);
    }
    return processor;
  }
}
