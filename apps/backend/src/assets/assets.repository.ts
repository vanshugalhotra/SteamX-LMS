/**
 * Persists asset and file state, coordinating conditional transitions and transactions
 * that keep one READY file per asset.
 */
import { Injectable } from '@nestjs/common';
import { AssetFileStatus, ContentStatus, Prisma } from '../generated/prisma/client.js';
import type { Asset, AssetFile } from '../generated/prisma/client.js';
import type { SupportedAssetType } from './asset-rules.js';
import type { AssetListQueryDto } from './dto/asset-list-query.dto.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ASSET_ACCESS_SELECT,
  ASSET_DETAIL_SELECT,
  ASSET_LIBRARY_SELECT,
  ASSET_SUMMARY_SELECT,
} from './assets.types.js';
import type {
  AssetAccessRecord,
  AssetDetailRecord,
  AssetFileForCompletion,
  AssetLibraryRecord,
  AssetSummaryRecord,
  CreateAssetFileRecordInput,
  DeleteAssetResult,
  MakeReadyInput,
  ReplaceAssetFileResult,
  UpdateAssetStatusResult,
} from './assets.types.js';

export type {
  AssetAccessRecord,
  AssetDetailRecord,
  AssetFileForCompletion,
  AssetLibraryRecord,
  CreateAssetFileRecordInput,
  DeleteAssetResult,
  MakeReadyInput,
  ReplaceAssetFileResult,
  UpdateAssetStatusResult,
} from './assets.types.js';

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns a filtered library page and total count in stable newest-first order. */
  findLibraryItems(
    query: AssetListQueryDto,
  ): Promise<{ items: AssetLibraryRecord[]; total: number }> {
    const where: Prisma.AssetWhereInput = {
      status: query.status,
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.search === undefined
        ? {}
        : {
            title: {
              contains: query.search.replace(/[\\%_]/g, '\\$&'),
              mode: 'insensitive',
            },
          }),
      ...(query.fileStatus === undefined ? {} : { files: { some: { status: query.fileStatus } } }),
    };
    const orderBy = [
      { createdAt: 'desc' },
      { id: 'desc' },
    ] satisfies Prisma.AssetOrderByWithRelationInput[];

    // The library is small; no additional index is needed for this list query.
    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.asset.findMany({ ...args, select: ASSET_LIBRARY_SELECT }),
      count: (filter) => this.prisma.asset.count({ where: filter }),
    });
  }

  /** Loads asset detail and its file attempts for the library response. */
  findLibraryAssetById(id: string): Promise<AssetDetailRecord | null> {
    return this.prisma.asset.findUnique({ where: { id }, select: ASSET_DETAIL_SELECT });
  }

  /** Selects only the newest READY file for signed access. */
  findAssetForAccess(id: string): Promise<AssetAccessRecord | null> {
    return this.prisma.asset.findUnique({ where: { id }, select: ASSET_ACCESS_SELECT });
  }

  /** Read requested asset summaries, using the save transaction when one is provided. */
  findSummaries(ids: string[], tx?: Prisma.TransactionClient): Promise<AssetSummaryRecord[]> {
    // Fetch all requested assets together instead of looking them up one by one.
    if (ids.length === 0) return Promise.resolve([]);
    // Saves pass tx so asset checks see the same transaction as the block replacement.
    return (tx ?? this.prisma).asset.findMany({
      where: { id: { in: ids } },
      select: ASSET_SUMMARY_SELECT,
    });
  }

  /** Loads only the asset identity and type needed to validate a replacement upload. */
  findAssetTypeById(id: string): Promise<Pick<Asset, 'id' | 'type'> | null> {
    return this.prisma.asset.findUnique({ where: { id }, select: { id: true, type: true } });
  }

  /** Updates the title and returns null when no asset has that ID. */
  async updateTitle(id: string, title: string): Promise<Asset | null> {
    const updated = await this.prisma.asset.updateMany({ where: { id }, data: { title } });
    return updated.count === 0 ? null : this.prisma.asset.findUnique({ where: { id } });
  }

  /**
   * Locks the asset row in a transaction before reading or changing its status.
   * Returns null when the asset is missing and reports unchanged status without writing.
   */
  updateStatus(id: string, status: ContentStatus): Promise<UpdateAssetStatusResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const lockedAssets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "assets" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (lockedAssets.length === 0) {
        return null;
      }

      const current = await tx.asset.findUniqueOrThrow({ where: { id } });
      if (current.status === status) {
        return { asset: current, oldStatus: current.status, changed: false };
      }

      const asset = await tx.asset.update({ where: { id }, data: { status } });
      return { asset, oldStatus: current.status, changed: true };
    });
  }

  /** Removes an asset and all its file rows under the lock shared with replacement and makeReady. */
  deleteAsset(id: string): Promise<DeleteAssetResult | null | 'in_progress'> {
    return this.prisma.$transaction(async (tx) => {
      const lockedAssets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "assets" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (lockedAssets.length === 0) {
        return null;
      }

      // UPLOADED and PROCESSING are in-flight work of complete, matching replacement's rule.
      const inFlightCount = await tx.assetFile.count({
        where: {
          assetId: id,
          status: { in: [AssetFileStatus.UPLOADED, AssetFileStatus.PROCESSING] },
        },
      });
      if (inFlightCount > 0) {
        return 'in_progress';
      }

      const asset = await tx.asset.findUniqueOrThrow({
        where: { id },
        select: { id: true, title: true, type: true },
      });
      const removed = await tx.assetFile.deleteMany({ where: { assetId: id } });
      await tx.asset.delete({ where: { id } });
      return { ...asset, removedFileCount: removed.count };
    });
  }

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

  /** Replaces unfinished attempts while holding the same asset lock used by makeReady. */
  replaceAssetFile(input: CreateAssetFileRecordInput): Promise<ReplaceAssetFileResult> {
    return this.prisma.$transaction(async (tx) => {
      const lockedAssets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "assets" WHERE "id" = ${input.assetId}::uuid FOR UPDATE
      `;
      if (lockedAssets.length === 0) {
        return { status: 'not_found' };
      }

      // UPLOADED and PROCESSING belong to complete's conditional transitions.
      const inFlightCount = await tx.assetFile.count({
        where: {
          assetId: input.assetId,
          status: { in: [AssetFileStatus.UPLOADED, AssetFileStatus.PROCESSING] },
        },
      });
      if (inFlightCount > 0) {
        return { status: 'in_progress' };
      }

      const removed = await tx.assetFile.deleteMany({
        where: {
          assetId: input.assetId,
          status: { in: [AssetFileStatus.UPLOADING, AssetFileStatus.FAILED] },
        },
      });
      const file = await this.createFile(tx, input);
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
      return { status: 'created', asset, file, removedCount: removed.count };
    });
  }

  /** Scopes the lookup by both IDs so a file under a different asset is indistinguishable from missing. */
  findFileByAssetId(assetId: string, fileId: string): Promise<AssetFile | null> {
    return this.prisma.assetFile.findFirst({ where: { id: fileId, assetId } });
  }

  /** Loads the asset type and a file's current status for an upload completion attempt. */
  findFileForCompletion(assetId: string, fileId: string): Promise<AssetFileForCompletion | null> {
    return this.prisma.assetFile.findFirst({
      where: { id: fileId, assetId },
      include: { asset: { select: { type: true } } },
    });
  }

  /** Loads a file attempt by its primary ID for returning its latest state after a race. */
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
