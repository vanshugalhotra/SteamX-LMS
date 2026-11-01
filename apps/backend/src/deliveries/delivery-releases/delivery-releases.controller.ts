import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../../auth/permissions.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import {
  DeliveryLessonReleaseResponseDto,
  DeliveryModuleReleaseResponseDto,
  DeliveryReleasesResponseDto,
} from './dto/delivery-releases-response.dto.js';
import { DeliveryReleasesService } from './delivery-releases.service.js';

/** Lists and changes lesson releases for a delivery. */
@ApiTags('Deliveries')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'Requires release.manage; students and ungranted callers are denied.',
})
@Controller({ path: 'deliveries' })
export class DeliveryReleasesController {
  constructor(private readonly deliveryReleases: DeliveryReleasesService) {}

  // ─────────────────────────────────────────
  // GET /deliveries/:id/releases — List release outline
  // ─────────────────────────────────────────

  /**
   * Lists the visible delivery's active course outline and release state, without lesson content.
   * @param actor Authenticated actor whose school and active teacher assignment scope the delivery.
   * @param id Delivery UUID.
   * @returns Active modules and lessons with their release state.
   * @throws NotFoundException when the delivery is missing, foreign, or not assigned to the teacher.
   */
  @RequirePermission(PERMISSION.RELEASE_MANAGE)
  @Get(':id/releases')
  @ApiOperation({ summary: 'List the release outline for a delivery' })
  @ApiOkResponse({
    description: 'The active course outline and derived release state.',
    type: DeliveryReleasesResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery not found or not visible to the caller.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryReleasesResponseDto> {
    return this.deliveryReleases.findMany(actor, id);
  }

  // ─────────────────────────────────────────
  // PUT /deliveries/:id/releases/lessons/:lessonId — Release a lesson
  // ─────────────────────────────────────────

  /**
   * Releases one eligible lesson for the visible delivery; an existing release keeps its timestamp.
   * @param actor Authenticated actor whose school and active teacher assignment scope the delivery.
   * @param id Delivery UUID.
   * @param lessonId Lesson UUID in the delivery course.
   * @returns The released lesson and its original release timestamp.
   * @throws NotFoundException when the delivery or lesson is unavailable in scope.
   * @throws ConflictException when the delivery is inactive or the lesson is not releasable.
   * @throws ForbiddenException when the course subscription is not current.
   */
  @RequirePermission(PERMISSION.RELEASE_MANAGE)
  @Put(':id/releases/lessons/:lessonId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release a lesson for a delivery' })
  @ApiOkResponse({
    description: 'The lesson release and its original release timestamp.',
    type: DeliveryLessonReleaseResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery or lesson ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or lesson not found in the delivery course.' })
  @ApiConflictResponse({ description: 'DELIVERY_NOT_ACTIVE or LESSON_NOT_RELEASABLE.' })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  releaseLesson(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<DeliveryLessonReleaseResponseDto> {
    return this.deliveryReleases.releaseLesson(actor, id, lessonId);
  }

  // ─────────────────────────────────────────
  // DELETE /deliveries/:id/releases/lessons/:lessonId — Un-release a lesson
  // ─────────────────────────────────────────

  /**
   * Removes a lesson release without changing completions; repeated removals are a no-op.
   * @param actor Authenticated actor whose school and active teacher assignment scope the delivery.
   * @param id Delivery UUID.
   * @param lessonId Lesson UUID in the delivery course.
   * @throws NotFoundException when the delivery or lesson is unavailable in scope.
   */
  @RequirePermission(PERMISSION.RELEASE_MANAGE)
  @Delete(':id/releases/lessons/:lessonId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a lesson release from a delivery' })
  @ApiNoContentResponse({ description: 'The release was removed or did not exist.' })
  @ApiBadRequestResponse({ description: 'The delivery or lesson ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or lesson not found in the delivery course.' })
  @ApiForbiddenResponse({ description: 'Permission denied.' })
  async unreleaseLesson(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<void> {
    await this.deliveryReleases.unreleaseLesson(actor, id, lessonId);
  }

  // ─────────────────────────────────────────
  // POST /deliveries/:id/releases/modules/:moduleId — Release a module
  // ─────────────────────────────────────────

  /**
   * Releases all currently eligible lessons in one active module.
   * @param actor Authenticated actor whose school and active teacher assignment scope the delivery.
   * @param id Delivery UUID.
   * @param moduleId Module UUID in the delivery course.
   * @returns Counts of newly released, already released, and skipped lessons.
   * @throws NotFoundException when the delivery or module is unavailable in scope.
   * @throws ConflictException when the delivery or module is inactive.
   * @throws ForbiddenException when the course subscription is not current.
   */
  @RequirePermission(PERMISSION.RELEASE_MANAGE)
  @Post(':id/releases/modules/:moduleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release all eligible lessons in a module' })
  @ApiOkResponse({
    description: 'Release counts for the module.',
    type: DeliveryModuleReleaseResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery or module ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or module not found in the delivery course.' })
  @ApiConflictResponse({ description: 'DELIVERY_NOT_ACTIVE or MODULE_NOT_ACTIVE.' })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  releaseModule(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
  ): Promise<DeliveryModuleReleaseResponseDto> {
    return this.deliveryReleases.releaseModule(actor, id, moduleId);
  }
}
