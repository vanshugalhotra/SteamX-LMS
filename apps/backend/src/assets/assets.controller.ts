import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PERMISSION } from '../auth/permissions.js';
import { AssetFileDto, CreateAssetResponseDto } from './dto/asset-response.dto.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { AssetListQueryDto } from './dto/asset-list-query.dto.js';
import { AssetLibraryDetailDto, AssetListResponseDto } from './dto/asset-library-response.dto.js';
import { AssetsService } from './assets.service.js';

/** HTTP and permission boundary for asset creation and file-state reads. */
@ApiTags('Assets')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
@ApiForbiddenResponse({ description: 'The required asset permission is missing.' })
@ApiInternalServerErrorResponse({ description: 'An unexpected server error occurred.' })
@Controller({ path: 'assets' })
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

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
  findLibraryAsset(@Param('id') id: string): Promise<AssetLibraryDetailDto> {
    return this.assets.findLibraryAsset(id);
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
