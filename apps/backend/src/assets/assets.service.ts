import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PinoLogger } from 'nestjs-pino';
import { AssetFileStatus } from '../generated/prisma/client.js';
import type { AssetFile } from '../generated/prisma/client.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { paginate } from '../common/pagination/paginate.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import type { Env } from '../config/env.schema.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { StorageService } from '../storage/storage.service.js';
import {
  AssetRuleError,
  buildOriginalKey,
  isSupportedAssetType,
  normalizeMimeType,
  normalizeStoredContentType,
  validateAssetUpload,
  verifyUploadHead,
  verifyUploadSignature,
} from './asset-rules.js';
import type { SupportedAssetType } from './asset-rules.js';
import type { CreateAssetDto } from './dto/create-asset.dto.js';
import type { AssetFileDto, CreateAssetResponseDto } from './dto/asset-response.dto.js';
import type { AssetListQueryDto } from './dto/asset-list-query.dto.js';
import type { AssetLibraryDetailDto, AssetListItemDto } from './dto/asset-library-response.dto.js';
import {
  toAssetFileDto,
  toAssetLibraryDetailDto,
  toAssetListItemDto,
  toCreateAssetResponse,
} from './assets.mapper.js';
import { AssetsRepository } from './assets.repository.js';
import { AssetUsageRepository } from './library/asset-usage.repository.js';
import { AssetProcessorRegistry } from './processing/asset-processor.registry.js';
import type { MakeReadyInput } from './assets.repository.js';

const UUID_SCHEMA = z.uuid();

/** Validates asset upload requests and coordinates database and object-storage work. */
@Injectable()
export class AssetsService {
  constructor(
    private readonly assets: AssetsRepository,
    private readonly assetUsage: AssetUsageRepository,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
    private readonly processors: AssetProcessorRegistry,
  ) {
    this.logger.setContext(AssetsService.name);
  }

  // ─────────────────────────────────────────
  // GET /assets — List library assets
  // ─────────────────────────────────────────

  /** Lists only ACTIVE or ARCHIVED assets with a READY file. */
  async findLibraryItems(
    query: AssetListQueryDto,
  ): Promise<PaginationResponseDto<AssetListItemDto>> {
    const { items, total } = await this.assets.findLibraryItems(query);
    return paginate(items.map(toAssetListItemDto), query.page, query.limit, total);
  }

  // ─────────────────────────────────────────
  // GET /assets/:id — Get a library asset
  // ─────────────────────────────────────────

  /** Reads a specific asset and current file state, including assets without READY files. */
  async findLibraryAsset(assetId: string): Promise<AssetLibraryDetailDto> {
    const asset = await this.assets.findLibraryAssetById(assetId);
    if (!asset) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    const { items, total } = await this.assetUsage.findByAssetId(assetId);
    return toAssetLibraryDetailDto(asset, {
      total,
      items: items.map((lesson) => ({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonStatus: lesson.status,
        moduleId: lesson.module.id,
        moduleTitle: lesson.module.title,
        courseId: lesson.courseId,
        courseTitle: lesson.module.course.title,
      })),
    });
  }

  // ─────────────────────────────────────────
  // POST /assets — Create an asset and upload file
  // ─────────────────────────────────────────

  /** Persists the upload intent first, then asks storage for a short-lived PUT URL. */
  async create(actor: AuthContext, body: CreateAssetDto): Promise<CreateAssetResponseDto> {
    const mimeType = normalizeMimeType(body.mimeType);
    let type: SupportedAssetType;
    try {
      type = validateAssetUpload(
        body.type,
        mimeType,
        body.sizeBytes,
        this.config.get('assetLimits', { infer: true }),
      );
    } catch (error) {
      // Keep rule failures in the public API error envelope with their stable asset-specific code.
      if (error instanceof AssetRuleError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      throw error;
    }

    const assetId = randomUUID().toLowerCase();
    const fileId = randomUUID().toLowerCase();
    // Both IDs form the storage prefix; user-supplied filenames never become object keys.
    const storageKey = buildOriginalKey(assetId, fileId);
    const { asset, file } = await this.assets.createAssetWithFile({
      assetId,
      type,
      title: body.title,
      file: {
        id: fileId,
        assetId,
        storageKey,
        originalFilename: body.filename,
        mimeType,
        sizeBytes: body.sizeBytes,
      },
    });

    // The DB transaction has committed before requesting the URL, as storage is outside that transaction.
    const upload = await this.storage.createUploadUrl({
      key: storageKey,
      contentType: mimeType,
      sizeBytes: body.sizeBytes,
    });
    // This endpoint only prepares the upload; it does not receive the bytes or start processing.
    this.logger.info(
      { actorId: actor.userId, assetId, fileId, type: asset.type, sizeBytes: body.sizeBytes },
      'Asset file upload created',
    );

    return toCreateAssetResponse(asset, file, upload);
  }

  // ─────────────────────────────────────────
  // GET /assets/:id/files/:fileId — Get file state
  // ─────────────────────────────────────────

  /** Returns only a file that belongs to the asset named in the route. */
  async findFile(assetId: string, fileId: string): Promise<AssetFileDto> {
    const normalizedAssetId = this.normalizeUuid(assetId);
    const normalizedFileId = this.normalizeUuid(fileId);
    if (!normalizedAssetId || !normalizedFileId) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const file = await this.assets.findFileByAssetId(normalizedAssetId, normalizedFileId);
    if (!file) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toAssetFileDto(file);
  }

  // ─────────────────────────────────────────
  // POST /assets/:id/files/:fileId/complete — Verify and process upload
  // ─────────────────────────────────────────

  /** Idempotently verifies an uploaded object and advances its file through processing. */
  async complete(assetId: string, fileId: string): Promise<AssetFileDto> {
    const normalizedAssetId = this.normalizeUuid(assetId);
    const normalizedFileId = this.normalizeUuid(fileId);
    if (!normalizedAssetId || !normalizedFileId) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const file = await this.assets.findFileForCompletion(normalizedAssetId, normalizedFileId);
    if (!file) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (file.status !== AssetFileStatus.UPLOADING) {
      return toAssetFileDto(file);
    }
    if (!isSupportedAssetType(file.asset.type)) {
      return this.failUpload(file.id, AssetFileStatus.UPLOADING, 'ASSET_TYPE_NOT_SUPPORTED');
    }

    const head = await this.storage.head(file.storageKey);
    if (!head) {
      this.logger.debug(
        { assetId: normalizedAssetId, fileId: normalizedFileId },
        'Asset upload has not reached storage yet',
      );
      throw new ConflictException({
        code: 'UPLOAD_NOT_COMPLETE',
        message: 'The uploaded file is not available yet. Retry completion after upload.',
      });
    }

    const limits = this.config.get('assetLimits', { infer: true });
    const headFailure = verifyUploadHead({
      assetType: file.asset.type,
      declaredSizeBytes: Number(file.sizeBytes),
      declaredMimeType: file.mimeType ?? '',
      actualSizeBytes: head.sizeBytes,
      actualContentType: head.contentType,
      limits,
    });
    if (headFailure) {
      return this.failUpload(file.id, AssetFileStatus.UPLOADING, headFailure);
    }

    const bytes = await this.storage.readFirstBytes(file.storageKey, 16);
    const signatureFailure = verifyUploadSignature(file.mimeType ?? '', bytes);
    if (signatureFailure) {
      return this.failUpload(file.id, AssetFileStatus.UPLOADING, signatureFailure);
    }

    const normalizedHeadMimeType = normalizeStoredContentType(head.contentType);
    const uploaded = await this.assets.transition(
      file.id,
      AssetFileStatus.UPLOADING,
      AssetFileStatus.UPLOADED,
      { sizeBytes: BigInt(head.sizeBytes), mimeType: normalizedHeadMimeType },
    );
    if (!uploaded) {
      return this.getCurrentFileState(file.id);
    }

    const processing = await this.assets.transition(
      file.id,
      AssetFileStatus.UPLOADED,
      AssetFileStatus.PROCESSING,
    );
    if (!processing) {
      return this.getCurrentFileState(file.id);
    }

    const processingFile = await this.assets.findFileForCompletion(normalizedAssetId, file.id);
    if (!processingFile) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    let playbackKey: string | null;
    try {
      const processor = this.processors.get(processingFile.asset.type);
      ({ playbackKey } = await processor.process(processingFile));
    } catch (error) {
      this.logger.error(
        { err: error, assetId: normalizedAssetId, fileId: file.id },
        'Asset processing failed',
      );
      return this.failUpload(file.id, AssetFileStatus.PROCESSING, 'PROCESSING_FAILED');
    }

    return toAssetFileDto(
      await this.makeReady(file.id, {
        sizeBytes: head.sizeBytes,
        mimeType: normalizedHeadMimeType,
        playbackKey,
      }),
    );
  }

  /**
   * Makes one processed file the asset's current serving file.
   * The repository transaction locks the asset and rolls back a failed conditional update.
   */
  makeReady(fileId: string, input: MakeReadyInput): Promise<AssetFile> {
    return this.assets.makeReady(fileId, input);
  }

  private async failUpload(
    fileId: string,
    from: AssetFileStatus,
    errorCode: string,
  ): Promise<AssetFileDto> {
    await this.assets.transition(fileId, from, AssetFileStatus.FAILED, { lastError: errorCode });
    return this.getCurrentFileState(fileId);
  }

  private async getCurrentFileState(fileId: string): Promise<AssetFileDto> {
    const file = await this.assets.findFileById(fileId);
    if (!file) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toAssetFileDto(file);
  }

  /** Normalizes accepted UUID casing; malformed IDs deliberately share the 404 response. */
  private normalizeUuid(value: string): string | null {
    return UUID_SCHEMA.safeParse(value).success ? value.toLowerCase() : null;
  }
}
