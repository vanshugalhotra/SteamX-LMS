/** HTTP and permission boundary for the nested course-outline read model. */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import { CourseOutlineResponseDto } from './dto/course-outline-response.dto.js';
import { CourseOutlineService } from './course-outline.service.js';

@ApiTags('Courses')
@ApiProtectedController()
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@Controller()
export class CourseOutlineController {
  constructor(private readonly outlines: CourseOutlineService) {}

  /** Returns the complete position-ordered outline or 404 for an unknown course. */
  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('courses/:id/outline')
  @ApiOperation({ summary: 'Get a course outline' })
  @ApiOkResponse({
    description: 'The complete course outline in position order.',
    type: CourseOutlineResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The course ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  findByCourseId(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseOutlineResponseDto> {
    return this.outlines.findByCourseId(actor, id);
  }
}
