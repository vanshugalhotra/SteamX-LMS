import { Injectable } from '@nestjs/common';
import { AssetFileStatus, ContentStatus, Prisma } from '../generated/prisma/client.js';
import type { Asset, AssetFile } from '../generated/prisma/client.js';
import type { SupportedAssetType } from './asset-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type AssetFileForCompletion = Prisma.AssetFileGetPayload<{
  include: { asset: { select: { type: true } } };
}>;

/** Data needed to create a file before the client has uploaded its object. */
export interface CreateAssetFileRecordInput {
  id: string;
  assetId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MakeReadyInput {
  sizeBytes: number;
  mimeType: string;
  playbackKey: string | null;
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

  findFileForCompletion(assetId: string, fileId: string): Promise<AssetFileForCompletion | null> {
    return this.prisma.assetFile.findFirst({
      where: { id: fileId, assetId },
      include: { asset: { select: { type: true } } },
    });
  }

  findFileById(fileId: string): Promise<AssetFile | null> {
    return this.prisma.assetFile.findUnique({ where: { id: fileId } });
  }

  /** Applies one status transition only if this caller still owns the expected current state. */
  async transition(
    fileId: string,
    from: AssetFileStatus,
    to: AssetFileStatus,
    data: Omit<Prisma.AssetFileUpdateManyMutationInput, 'status'> = {},
  ): Promise<boolean> {
    const result = await this.prisma.assetFile.updateMany({
      where: { id: fileId, status: from },
      data: { ...data, status: to },
    });
    return result.count === 1;
  }

  /**
   * Replaces the serving file under an asset lock. The lock serializes completions
   * for different files belonging to the same asset.
   */
  makeReady(fileId: string, input: MakeReadyInput): Promise<AssetFile> {
    return this.prisma.$transaction(async (tx) => {
      const pendingFile = await tx.assetFile.findUnique({
        where: { id: fileId },
        select: { assetId: true },
      });
      if (!pendingFile) {
        throw new Error('Asset file disappeared before it could become READY.');
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "assets" WHERE "id" = ${pendingFile.assetId}::uuid FOR UPDATE
      `;

      await tx.assetFile.deleteMany({
        where: {
          assetId: pendingFile.assetId,
          status: AssetFileStatus.READY,
          id: { not: fileId },
        },
      });

      const updated = await tx.assetFile.updateMany({
        where: { id: fileId, status: AssetFileStatus.PROCESSING },
        data: {
          status: AssetFileStatus.READY,
          sizeBytes: BigInt(input.sizeBytes),
          mimeType: input.mimeType,
          playbackKey: input.playbackKey,
        },
      });

      // Check after deleting the previous READY row but before commit: throwing rolls back
      // that deletion (and its cleanup-trigger insert) if this file is no longer PROCESSING.
      if (updated.count !== 1) {
        throw new Error('Asset file is no longer PROCESSING.');
      }

      return tx.assetFile.findUniqueOrThrow({ where: { id: fileId } });
    });
  }
}
