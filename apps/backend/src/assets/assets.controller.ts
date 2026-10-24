import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PERMISSION } from '../auth/permissions.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import type { Response } from 'express';
import { AssetFileDto, CreateAssetResponseDto } from './dto/asset-response.dto.js';
import { AssetAccessResponseDto } from './dto/asset-access-response.dto.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { CreateAssetFileDto } from './dto/create-asset-file.dto.js';
import { AssetListQueryDto } from './dto/asset-list-query.dto.js';
import { AssetLibraryDetailDto, AssetListResponseDto } from './dto/asset-library-response.dto.js';
import { AssetsService } from './assets.service.js';
import { AssetAccessService } from './asset-access.service.js';

/** HTTP and permission boundary for asset creation and file-state reads. */
@ApiTags('Assets')
@ApiProtectedController()
@ApiForbiddenResponse({ description: 'The required asset permission is missing.' })
@Controller({ path: 'assets' })
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly assetAccess: AssetAccessService,
  ) {}

  // ─────────────────────────────────────────
  // GET /assets — List library assets
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get()
  @ApiOperation({ summary: 'List assets available in the library' })
  @ApiOkResponse({ description: 'Paginated assets with READY files.', type: AssetListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  findLibraryItems(@Query() query: AssetListQueryDto): Promise<AssetListResponseDto> {
    return this.assets.findLibraryItems(query);
  }

  // ─────────────────────────────────────────
  // GET /assets/:id — Get library asset
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get an asset and its lesson usage' })
  @ApiOkResponse({
    description: 'Asset file state and where-used lessons.',
    type: AssetLibraryDetailDto,
  })
  @ApiNotFoundResponse({ description: 'Asset not found.' })
  findLibraryAsset(
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
  ): Promise<AssetLibraryDetailDto> {
    return this.assets.findLibraryAsset(id);
  }

  // ─────────────────────────────────────────
  // GET /assets/:id/access — Issue an author preview URL
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get(':id/access')
  @ApiOperation({
    summary: 'Issue a short-lived URL for an asset preview',
    description:
      'The URL TTL is selected by asset type. Clients should request a new URL after a fetch returns 403; the configured TTL should cover normal viewing and byte-range requests.',
  })
  @ApiOkResponse({ description: 'Short-lived asset access URL.', type: AssetAccessResponseDto })
  @ApiConflictResponse({ description: 'Asset has no READY file (ASSET_NOT_READY).' })
  @ApiNotFoundResponse({ description: 'Asset not found or ID is malformed.' })
  issueAccess(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AssetAccessResponseDto> {
    response.setHeader('Cache-Control', 'no-store');
    return this.assetAccess.issueForAuthor(id, actor);
  }

  // ─────────────────────────────────────────
  // POST /assets — Create an asset and upload file
  // ─────────────────────────────────────────

  /** Requires write permission; the service handles rules and upload setup. */
  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Post()
  @ApiOperation({ summary: 'Create an asset and prepare a file upload' })
  @ApiCreatedResponse({
    description: 'Asset, file, and upload instructions.',
    type: CreateAssetResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Asset type, MIME type, size, or metadata is invalid.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateAssetDto,
  ): Promise<CreateAssetResponseDto> {
    return this.assets.create(actor, body);
  }

  // ─────────────────────────────────────────
  // POST /assets/:id/files — Replace or retry a file
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Post(':id/files')
  @ApiOperation({ summary: 'Replace or retry an asset file upload' })
  @ApiCreatedResponse({
    description: 'Asset, new file, and upload instructions.',
    type: CreateAssetResponseDto,
  })
  @ApiBadRequestResponse({ description: 'MIME type or size is invalid for the asset type.' })
  @ApiConflictResponse({
    description: 'An UPLOADED or PROCESSING file is already in progress.',
  })
  @ApiNotFoundResponse({ description: 'Asset not found or ID is malformed.' })
  replaceFile(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
    @Body() body: CreateAssetFileDto,
  ): Promise<CreateAssetResponseDto> {
    return this.assets.replaceFile(actor, id, body);
  }

  // ─────────────────────────────────────────
  // GET /assets/:id/files/:fileId — Get file state
  // ─────────────────────────────────────────

  /** Requires read permission; IDs are checked together by the service/repository. */
  @RequirePermission(PERMISSION.ASSET_READ)
  @Get(':id/files/:fileId')
  @ApiOperation({ summary: 'Get asset file upload and processing state' })
  @ApiOkResponse({ description: 'Asset file state.', type: AssetFileDto })
  @ApiNotFoundResponse({ description: 'Asset file not found.' })
  findFile(@Param('id') assetId: string, @Param('fileId') fileId: string): Promise<AssetFileDto> {
    return this.assets.findFile(assetId, fileId);
  }

  // ─────────────────────────────────────────
  // POST /assets/:id/files/:fileId/complete — Complete upload
  // ─────────────────────────────────────────

  /** Verifies an uploaded object and returns its current lifecycle state. */
  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Post(':id/files/:fileId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and complete an asset file upload' })
  @ApiOkResponse({ description: 'Current asset file state.', type: AssetFileDto })
  @ApiConflictResponse({ description: 'The object is not available in storage yet; retry later.' })
  @ApiNotFoundResponse({ description: 'Asset file not found.' })
  complete(@Param('id') assetId: string, @Param('fileId') fileId: string): Promise<AssetFileDto> {
    return this.assets.complete(assetId, fileId);
  }
}
