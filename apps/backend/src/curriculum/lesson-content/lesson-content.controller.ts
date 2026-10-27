import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { PERMISSION } from '../../auth/permissions.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import { LessonContentResponseDto } from './dto/lesson-content-response.dto.js';
import { LessonContentService } from './lesson-content.service.js';

@ApiTags('Lessons')
@ApiProtectedController()
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@Controller()
export class LessonContentController {
  constructor(private readonly lessonContent: LessonContentService) {}

  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('lessons/:id/content')
  @ApiOperation({ summary: 'Get lesson content' })
  @ApiOkResponse({
    description:
      'The current save-shaped block tree, version token, and referenced asset summaries.',
    type: LessonContentResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Lesson not found or the lesson ID is invalid.' })
  findByLessonId(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
  ): Promise<LessonContentResponseDto> {
    return this.lessonContent.findByLessonId(actor, id);
  }
}
