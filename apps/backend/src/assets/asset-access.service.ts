import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AssetType } from '../generated/prisma/client.js';
import type { AssetFile } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';
import { assertPlatformStaff } from '../auth/assert-platform-staff.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { StorageService } from '../storage/storage.service.js';
import type { AssetAccessResponseDto } from './dto/asset-access-response.dto.js';
import { AssetsRepository } from './assets.repository.js';

type AssetFileForSigning = Pick<
  AssetFile,
  'id' | 'assetId' | 'storageKey' | 'playbackKey' | 'originalFilename' | 'mimeType'
>;

function ttlFor(type: AssetType, access: Env['assetAccess']): number {
  switch (type) {
    case AssetType.IMAGE:
      return access.imageTtlSeconds;
    case AssetType.PDF:
      return access.pdfTtlSeconds;
    case AssetType.VIDEO:
      return access.videoTtlSeconds;
    default:
      throw new Error(`Asset type "${type}" cannot be served.`);
  }
}

@Injectable()
export class AssetAccessService {
  constructor(
    private readonly assets: AssetsRepository,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AssetAccessService.name);
  }

  /**
   * Author previews are platform-staff-only, even when another role has asset.read.
   * Module 3's student path must do lesson, delivery, and subscription checks in its caller
   * before calling issueForFile.
   */
  async issueForAuthor(assetId: string, actor: AuthContext): Promise<AssetAccessResponseDto> {
    assertPlatformStaff(actor);
    // This lookup filters files to READY and takes the newest one, excluding in-progress replacements.
    const asset = await this.assets.findAssetForAccess(assetId);
    if (!asset) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const file = asset.files[0];
    if (!file) {
      throw new ConflictException(API_ERROR.ASSET_NOT_READY);
    }

    const access = await this.issueForFile(file, asset.type);
    this.logger.debug(
      { assetId, fileId: file.id, userId: actor.userId },
      'Issued author asset access URL',
    );
    return access;
  }

  /** Delivers a READY file; this is the only method that creates a signed URL. */
  async issueForFile(
    file: AssetFileForSigning,
    assetType: AssetType,
  ): Promise<AssetAccessResponseDto> {
    if (!file.mimeType) {
      throw new Error('READY asset file is missing its MIME type.');
    }
    const key = file.playbackKey ?? file.storageKey;
    const { url, expiresAt } = await this.storage.createDownloadUrl({
      key,
      expiresInSeconds: ttlFor(assetType, this.config.get('assetAccess', { infer: true })),
      contentType: file.mimeType,
      filename: file.originalFilename ?? undefined,
    });
    return { url, expiresAt, type: assetType, mimeType: file.mimeType };
  }
}
