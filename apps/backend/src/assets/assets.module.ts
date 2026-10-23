import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetUsageRepository } from './asset-usage.repository.js';
import { AssetsRepository } from './assets.repository.js';
import { AssetsService } from './assets.service.js';
// Registered as the next lifecycle seam; these endpoints do not invoke processing yet.
import { AssetProcessingModule } from './processing/asset-processing.module.js';

/** Wires asset persistence and routes to the shared storage and processing boundaries. */
@Module({
  imports: [PrismaModule, StorageModule, AssetProcessingModule],
  controllers: [AssetsController],
  providers: [AssetsRepository, AssetUsageRepository, AssetsService],
})
export class AssetsModule {}
