import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { PERMISSION } from '../../auth/permissions.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { CourseOutlineResponseDto } from './dto/course-outline-response.dto.js';
import { CourseOutlineService } from './course-outline.service.js';

@ApiTags('Courses')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@ApiInternalServerErrorResponse({ description: 'An unexpected server error occurred.' })
@Controller()
export class CourseOutlineController {
  constructor(private readonly outlines: CourseOutlineService) {}

  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('courses/:id/outline')
  @ApiOperation({ summary: 'Get a course outline' })
  @ApiOkResponse({
    description: 'The complete course outline in position order.',
    type: CourseOutlineResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Course not found or the course ID is invalid.' })
  findByCourseId(
    @CurrentAuth() actor: AuthContext,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(API_ERROR.NOT_FOUND),
      }),
    )
    id: string,
  ): Promise<CourseOutlineResponseDto> {
    return this.outlines.findByCourseId(actor, id);
  }
}
