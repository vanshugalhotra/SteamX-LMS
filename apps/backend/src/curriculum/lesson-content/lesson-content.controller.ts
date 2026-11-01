/** Declares authenticated routes for reading and replacing lesson content. */
import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { PERMISSION } from '../../auth/permissions.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import { LessonContentResponseDto } from './dto/lesson-content-response.dto.js';
import { SaveLessonContentDto } from './dto/save-lesson-content.dto.js';
import { LessonContentService } from './lesson-content.service.js';

@ApiTags('Lessons')
@ApiProtectedController()
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@Controller()
export class LessonContentController {
  /** Inject the service that handles lesson-content rules and database work. */
  constructor(private readonly lessonContent: LessonContentService) {}

  /** Reads the lesson tree and referenced asset summaries for an authorized curriculum reader. */
  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('lessons/:id/content')
  @ApiOperation({ summary: 'Get lesson content' })
  @ApiOkResponse({
    description:
      'The current save-shaped block tree, version token, and referenced asset summaries.',
    type: LessonContentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The lesson ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Lesson not found.' })
  findByLessonId(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LessonContentResponseDto> {
    return this.lessonContent.findByLessonId(actor, id);
  }

  /** Replace the full lesson tree for an authorized curriculum writer. */
  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Put('lessons/:id/content')
  @ApiOperation({ summary: 'Replace lesson content' })
  @ApiOkResponse({
    description: 'The saved content tree, new version token, and referenced asset summaries.',
    type: LessonContentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The lesson ID, version, or lesson content is invalid.' })
  @ApiNotFoundResponse({ description: 'Lesson not found.' })
  @ApiConflictResponse({ description: 'The lesson content version is stale.' })
  @ApiResponse({ status: 413, description: 'The JSON request body exceeds 1 MB.' })
  saveByLessonId(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveLessonContentDto,
  ): Promise<LessonContentResponseDto> {
    return this.lessonContent.saveByLessonId(actor, id, body);
  }
}
