import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PinoLogger } from 'nestjs-pino';
import type { AuthContext } from '../auth/types/auth-context.js';
import type { Env } from '../config/env.schema.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { StorageService } from '../storage/storage.service.js';
import {
  AssetRuleError,
  buildOriginalKey,
  normalizeMimeType,
  validateAssetUpload,
} from './asset-rules.js';
import type { SupportedAssetType } from './asset-rules.js';
import type { CreateAssetDto } from './dto/create-asset.dto.js';
import type { AssetFileDto, CreateAssetResponseDto } from './dto/asset-response.dto.js';
import { toAssetFileDto, toCreateAssetResponse } from './assets.mapper.js';
import { AssetsRepository } from './assets.repository.js';

const UUID_SCHEMA = z.uuid();

/** Validates asset upload requests and coordinates database and object-storage work. */
@Injectable()
export class AssetsService {
  constructor(
    private readonly assets: AssetsRepository,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AssetsService.name);
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

  /** Normalizes accepted UUID casing; malformed IDs deliberately share the 404 response. */
  private normalizeUuid(value: string): string | null {
    return UUID_SCHEMA.safeParse(value).success ? value.toLowerCase() : null;
  }
}
