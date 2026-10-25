import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { isForeignKeyViolation, isPrismaKnownError } from '../../common/errors/prisma-error.js';
import type { Env } from '../../config/env.schema.js';
import { AssetFileStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AssetCleanupResult {
  staleFilesDeleted: number;
  ghostAssetsDeleted: number;
}

@Injectable()
export class AssetCleanupService {
  /** Maximum stale files and empty assets processed in one run. */
  private readonly batchSize: number;
  /** Minimum age of a non-READY file before it is treated as abandoned. */
  private readonly staleAfterHours: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.batchSize = config.get('cleanup.batchSize', { infer: true });
    this.staleAfterHours = config.get('cleanup.assetStaleFileAfterHours', { infer: true });
    this.logger.setContext(AssetCleanupService.name);
  }

  async run(): Promise<AssetCleanupResult> {
    // READY files are live content; only remove incomplete or failed files past the age limit.
    const staleCutoff = new Date(Date.now() - this.staleAfterHours * 60 * 60 * 1_000);
    const staleFileCandidates = await this.prisma.assetFile.findMany({
      where: {
        status: { not: AssetFileStatus.READY },
        updatedAt: { lt: staleCutoff },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
      select: { id: true },
    });
    const staleFiles =
      staleFileCandidates.length === 0
        ? { count: 0 }
        : await this.prisma.assetFile.deleteMany({
            where: {
              id: { in: staleFileCandidates.map(({ id }) => id) },
              status: { not: AssetFileStatus.READY },
              updatedAt: { lt: staleCutoff },
            },
          });

    // Removing stale files may leave empty assets, so this step is also limited per run.
    const ghostAssets = await this.prisma.asset.findMany({
      where: {
        files: { none: {} },
        blocks: { none: {} },
      },
      orderBy: { id: 'asc' },
      take: this.batchSize,
      select: { id: true },
    });

    let ghostAssetsDeleted = 0;
    for (const asset of ghostAssets) {
      try {
        await this.prisma.asset.delete({ where: { id: asset.id } });
        ghostAssetsDeleted += 1;
      } catch (error) {
        // Another request may reference or remove the asset after the query, so skip these races.
        if (isForeignKeyViolation(error) || (isPrismaKnownError(error) && error.code === 'P2025')) {
          this.logger.debug(
            { assetId: asset.id },
            'Ghost asset was referenced or already deleted during cleanup',
          );
          continue;
        }
        throw error;
      }
    }

    return { staleFilesDeleted: staleFiles.count, ghostAssetsDeleted };
  }
}
