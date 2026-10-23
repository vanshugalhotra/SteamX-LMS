import { Injectable } from '@nestjs/common';
import { AssetFileStatus, ContentStatus, Prisma } from '../generated/prisma/client.js';
import type { Asset, AssetFile } from '../generated/prisma/client.js';
import type { SupportedAssetType } from './asset-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Data needed to create a file before the client has uploaded its object. */
export interface CreateAssetFileRecordInput {
  id: string;
  assetId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the stable asset identity and its first upload attempt atomically. */
  createAssetWithFile(input: {
    assetId: string;
    type: SupportedAssetType;
    title: string;
    file: CreateAssetFileRecordInput;
  }): Promise<{ asset: Asset; file: AssetFile }> {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          id: input.assetId,
          type: input.type,
          title: input.title,
          status: ContentStatus.ACTIVE,
        },
      });
      // A missing file row must roll back the asset too; clients should never get an empty asset.
      const file = await this.createFile(tx, input.file);
      return { asset, file };
    });
  }

  /**
   * Inserts an UPLOADING row. Kept separate so replacement uploads can create another
   * file for an existing asset using their own transaction.
   */
  createFile(tx: Prisma.TransactionClient, input: CreateAssetFileRecordInput): Promise<AssetFile> {
    return tx.assetFile.create({
      data: {
        id: input.id,
        assetId: input.assetId,
        status: AssetFileStatus.UPLOADING,
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
      },
    });
  }

  /** Scopes the lookup by both IDs so a file under a different asset is indistinguishable from missing. */
  findFileByAssetId(assetId: string, fileId: string): Promise<AssetFile | null> {
    return this.prisma.assetFile.findFirst({ where: { id: fileId, assetId } });
  }
}
