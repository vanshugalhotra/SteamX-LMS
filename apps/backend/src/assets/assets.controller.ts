import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { AssetDto, AssetFileDto, CreateAssetResponseDto } from './dto/asset-response.dto.js';
import { AssetAccessResponseDto } from './dto/asset-access-response.dto.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { CreateAssetFileDto } from './dto/create-asset-file.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto.js';
import { AssetListQueryDto } from './dto/asset-list-query.dto.js';
import { AssetLibraryDetailDto, AssetListResponseDto } from './dto/asset-library-response.dto.js';
import { AssetsService } from './assets.service.js';
import { AssetAccessService } from './asset-access.service.js';

/** HTTP and permission boundary for asset creation and file-state reads. */
@ApiTags('Assets')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'The required permission is missing, or Origin is invalid.',
})
@Controller({ path: 'assets' })
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly assetAccess: AssetAccessService,
  ) {}

  // ─────────────────────────────────────────
  // GET /assets — List assets
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get()
  @ApiOperation({ summary: 'List assets' })
  @ApiOkResponse({ description: 'Paginated assets with READY files.', type: AssetListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  findLibraryItems(@Query() query: AssetListQueryDto): Promise<AssetListResponseDto> {
    return this.assets.findLibraryItems(query);
  }

  // ─────────────────────────────────────────
  // GET /assets/:id — Get an asset
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get an asset' })
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
  // GET /assets/:id/access — Get an asset access URL
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get(':id/access')
  @ApiOperation({ summary: 'Get an asset access URL' })
  @ApiOkResponse({ description: 'Short-lived asset access URL.', type: AssetAccessResponseDto })
  @ApiConflictResponse({ description: 'Asset has no READY file.' })
  @ApiNotFoundResponse({ description: 'Asset not found.' })
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
  // POST /assets — Create an asset
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Post()
  @ApiOperation({ summary: 'Create an asset' })
  @ApiCreatedResponse({
    description: 'Asset, file, and upload instructions.',
    type: CreateAssetResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Asset details or upload metadata are invalid.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateAssetDto,
  ): Promise<CreateAssetResponseDto> {
    return this.assets.create(actor, body);
  }

  // ─────────────────────────────────────────
  // PATCH /assets/:id/status — Update an asset status
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update an asset status' })
  @ApiOkResponse({ description: 'Asset status updated.', type: AssetDto })
  @ApiBadRequestResponse({ description: 'The asset ID or status is invalid.' })
  @ApiNotFoundResponse({ description: 'Asset not found.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
    @Body() body: UpdateAssetStatusDto,
  ): Promise<AssetDto> {
    return this.assets.updateStatus(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /assets/:id — Update an asset
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update an asset' })
  @ApiOkResponse({ description: 'Asset updated.', type: AssetDto })
  @ApiBadRequestResponse({ description: 'The asset ID or title is invalid.' })
  @ApiNotFoundResponse({ description: 'Asset not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
    @Body() body: UpdateAssetDto,
  ): Promise<AssetDto> {
    return this.assets.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // DELETE /assets/:id — Delete an asset
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiNoContentResponse({ description: 'Asset deleted.' })
  @ApiConflictResponse({
    description: 'Asset is in use or an upload is still being processed.',
  })
  @ApiNotFoundResponse({ description: 'Asset not found.' })
  delete(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
  ): Promise<void> {
    return this.assets.delete(actor, id);
  }

  // ─────────────────────────────────────────
  // POST /assets/:id/files — Replace a file
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Post(':id/files')
  @ApiOperation({ summary: 'Replace an asset file' })
  @ApiCreatedResponse({
    description: 'Asset, new file, and upload instructions.',
    type: CreateAssetResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Upload metadata is invalid.' })
  @ApiConflictResponse({ description: 'A file upload is already being processed.' })
  @ApiNotFoundResponse({ description: 'Asset not found.' })
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

  @RequirePermission(PERMISSION.ASSET_READ)
  @Get(':id/files/:fileId')
  @ApiOperation({ summary: 'Get asset file status' })
  @ApiOkResponse({ description: 'Asset file state.', type: AssetFileDto })
  @ApiNotFoundResponse({ description: 'Asset file not found.' })
  findFile(
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    assetId: string,
    @Param(
      'fileId',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    fileId: string,
  ): Promise<AssetFileDto> {
    return this.assets.findFile(assetId, fileId);
  }

  // ─────────────────────────────────────────
  // POST /assets/:id/files/:fileId/complete — Complete upload
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.ASSET_WRITE)
  @Post(':id/files/:fileId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an asset file upload' })
  @ApiOkResponse({ description: 'Current asset file state.', type: AssetFileDto })
  @ApiConflictResponse({ description: 'The uploaded file is not available yet.' })
  @ApiNotFoundResponse({ description: 'Asset file not found.' })
  complete(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    assetId: string,
    @Param(
      'fileId',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    fileId: string,
  ): Promise<AssetFileDto> {
    return this.assets.complete(actor, assetId, fileId);
  }
}
