import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContentStatus, DeliveryStatus, LessonAudience } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
} from '../../common/errors/prisma-error.js';
import { CourseAccessService } from '../../subscriptions/course-access.service.js';
import { DeliveryAccessService } from '../delivery-access.service.js';
import { getLessonReleaseIneligibilityReason } from './delivery-release-eligibility.js';
import { DeliveryReleasesRepository } from './delivery-releases.repository.js';
import type {
  DeliveryLessonReleaseResponseDto,
  DeliveryModuleReleaseResponseDto,
  DeliveryReleasesResponseDto,
  ModuleReleaseState,
} from './dto/delivery-releases-response.dto.js';

/** Applies release lifecycle rules and builds the delivery's student-visible outline. */
@Injectable()
export class DeliveryReleasesService {
  constructor(
    private readonly deliveryAccess: DeliveryAccessService,
    private readonly releases: DeliveryReleasesRepository,
    private readonly courseAccess: CourseAccessService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryReleasesService.name);
  }

  /**
   * Builds the visible delivery's active course outline and each lesson's release eligibility/state.
   * @param actor Authenticated actor used to resolve delivery and teacher visibility.
   * @param deliveryId Delivery whose outline is requested.
   * @returns Active modules and lessons with aggregate and per-lesson release state.
   * @throws NotFoundException when the delivery is missing, outside school scope, or unassigned.
   */
  async findMany(actor: AuthContext, deliveryId: string): Promise<DeliveryReleasesResponseDto> {
    const delivery = await this.deliveryAccess.load(actor, deliveryId);
    const modules = await this.releases.findActiveOutline(delivery.courseId);
    const lessonIds = modules.flatMap(({ lessons }) => lessons.map(({ id }) => id));
    const releaseRows = await this.releases.findMany(delivery.id, lessonIds);
    const releasesByLessonId = new Map(releaseRows.map((release) => [release.lessonId, release]));
    return {
      modules: modules.map((module) => {
        const eligibleLessons = module.lessons.filter(
          (lesson) => getLessonReleaseIneligibilityReason(lesson, module.status) === undefined,
        );
        const releasedCount = eligibleLessons.filter((lesson) =>
          releasesByLessonId.has(lesson.id),
        ).length;
        const releasableLessonCount = eligibleLessons.length;
        const releaseState: ModuleReleaseState =
          releasableLessonCount === 0
            ? 'NONE'
            : releasedCount === 0
              ? 'NONE'
              : releasedCount === releasableLessonCount
                ? 'ALL'
                : 'PARTIAL';
        return {
          id: module.id,
          title: module.title,
          position: module.position,
          releaseState,
          releasedCount,
          releasableLessonCount,
          lessons: module.lessons.map((lesson) => {
            const release = releasesByLessonId.get(lesson.id);
            return {
              id: lesson.id,
              title: lesson.title,
              position: lesson.position,
              audience: lesson.audience,
              released: release !== undefined,
              releasedAt: release?.releasedAt ?? null,
              releasable: getLessonReleaseIneligibilityReason(lesson, module.status) === undefined,
            };
          }),
        };
      }),
    };
  }

  /**
   * Releases one eligible lesson; duplicate requests retain the original timestamp.
   * The write is rechecked by database constraints to handle concurrent status changes.
   * @param actor Authenticated actor recording the release.
   * @param deliveryId Visible delivery to update.
   * @param lessonId Lesson in the delivery course.
   * @returns Release state and the persisted timestamp.
   * @throws NotFoundException when the delivery or lesson is unavailable in scope.
   * @throws ConflictException when the delivery is inactive or lesson is ineligible.
   * @throws ForbiddenException when course access has expired.
   */
  async releaseLesson(
    actor: AuthContext,
    deliveryId: string,
    lessonId: string,
  ): Promise<DeliveryLessonReleaseResponseDto> {
    const delivery = await this.deliveryAccess.load(actor, deliveryId);
    this.assertDeliveryActive(delivery.status);
    await this.courseAccess.assertSubscriptionActive(delivery.schoolId, delivery.courseId);
    const lesson = await this.releases.findLesson(delivery.courseId, lessonId);
    if (!lesson) {
      throw new NotFoundException(API_ERROR.LESSON_NOT_FOUND);
    }
    this.assertLessonReleasable(lesson);

    let result: { releasedAt: Date; newlyReleased: number };
    try {
      result = await this.releases.createRelease({
        deliveryId: delivery.id,
        lessonId,
        schoolId: delivery.schoolId,
        courseId: delivery.courseId,
        releasedById: actor.userId,
      });
    } catch (error) {
      this.mapReleaseWriteError(error);
      throw error;
    }
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'release',
        deliveryId: delivery.id,
        lessonId,
        newlyReleased: result.newlyReleased,
        alreadyReleased: 1 - result.newlyReleased,
      },
      'Delivery lesson released',
    );
    return { lessonId, released: true, releasedAt: result.releasedAt };
  }

  /**
   * Removes one release without changing lesson completion records.
   * @param actor Authenticated actor recording the removal.
   * @param deliveryId Visible delivery to update.
   * @param lessonId Lesson in the delivery course.
   * @throws NotFoundException when the delivery or lesson is unavailable in scope.
   */
  async unreleaseLesson(actor: AuthContext, deliveryId: string, lessonId: string): Promise<void> {
    const delivery = await this.deliveryAccess.load(actor, deliveryId);
    const lesson = await this.releases.findLesson(delivery.courseId, lessonId);
    if (!lesson) {
      throw new NotFoundException(API_ERROR.LESSON_NOT_FOUND);
    }
    const result = await this.releases.deleteRelease(delivery.id, lessonId);
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'unrelease',
        deliveryId: delivery.id,
        lessonId,
        deleted: result.count,
      },
      'Delivery lesson un-released',
    );
  }

  /**
   * Releases eligible lessons in one active module and counts skipped ineligible lessons.
   * Existing releases remain unchanged; new rows are written in one transaction.
   * @param actor Authenticated actor recording the releases.
   * @param deliveryId Visible delivery to update.
   * @param moduleId Active module in the delivery course.
   * @returns Counts of inserted, existing, and ineligible lesson releases.
   * @throws NotFoundException when the delivery or module is unavailable in scope.
   * @throws ConflictException when the delivery or module is inactive.
   * @throws ForbiddenException when course access has expired.
   */
  async releaseModule(
    actor: AuthContext,
    deliveryId: string,
    moduleId: string,
  ): Promise<DeliveryModuleReleaseResponseDto> {
    const delivery = await this.deliveryAccess.load(actor, deliveryId);
    this.assertDeliveryActive(delivery.status);
    await this.courseAccess.assertSubscriptionActive(delivery.schoolId, delivery.courseId);
    const module = await this.releases.findModule(delivery.courseId, moduleId);
    if (!module) {
      throw new NotFoundException(API_ERROR.MODULE_NOT_FOUND);
    }
    if (module.status !== ContentStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.MODULE_NOT_ACTIVE);
    }
    const eligibleLessons = module.lessons.filter(
      (lesson) => getLessonReleaseIneligibilityReason(lesson, module.status) === undefined,
    );
    let newlyReleased = 0;
    try {
      newlyReleased = await this.releases.createManyReleases({
        deliveryId: delivery.id,
        schoolId: delivery.schoolId,
        courseId: delivery.courseId,
        releasedById: actor.userId,
        lessonIds: eligibleLessons.map(({ id }) => id),
      });
    } catch (error) {
      this.mapReleaseWriteError(error);
      throw error;
    }
    const counts: DeliveryModuleReleaseResponseDto = {
      moduleId,
      newlyReleased,
      alreadyReleased: eligibleLessons.length - newlyReleased,
      skippedNotReleasable: module.lessons.length - eligibleLessons.length,
    };
    this.logger.info(
      {
        actorId: actor.userId,
        action: 'release-module',
        deliveryId: delivery.id,
        moduleId,
        newlyReleased: counts.newlyReleased,
        alreadyReleased: counts.alreadyReleased,
        skippedNotReleasable: counts.skippedNotReleasable,
      },
      'Delivery module lessons released',
    );
    return counts;
  }

  /**
   * Requires an active delivery before creating releases.
   * @param status Current delivery status.
   * @throws ConflictException when the delivery is inactive.
   */
  private assertDeliveryActive(status: DeliveryStatus): void {
    if (status !== DeliveryStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.DELIVERY_NOT_ACTIVE);
    }
  }

  /**
   * Requires a student-facing lesson and active lesson and parent module.
   * @param lesson Lesson audience and status with its parent module status.
   * @throws ConflictException when the lesson is not releasable.
   */
  private assertLessonReleasable(lesson: {
    status: ContentStatus;
    audience: LessonAudience;
    module: { status: ContentStatus };
  }): void {
    const reason = getLessonReleaseIneligibilityReason(lesson, lesson.module.status);
    if (reason) {
      throw new ConflictException({ ...API_ERROR.LESSON_NOT_RELEASABLE, details: { reason } });
    }
  }

  /**
   * Maps recognized database trigger failures to their release API errors.
   * @param error Error raised while writing a release.
   * @throws ConflictException when the delivery or lesson is no longer eligible.
   * @throws ForbiddenException when course access is no longer current.
   */
  private mapReleaseWriteError(error: unknown): void {
    const postgresCode = getPostgresCode(error);
    if (
      !(isPrismaKnownError(error) && error.code === 'P2004') &&
      postgresCode !== '23000' &&
      postgresCode !== '23514'
    ) {
      return;
    }
    const reason = getPrismaReason(error).toLowerCase();
    if (
      reason.includes('delivery_lesson_releases require an active module') ||
      reason.includes('delivery_lesson_releases require an active student lesson')
    ) {
      throw new ConflictException({
        ...API_ERROR.LESSON_NOT_RELEASABLE,
        details: { reason: 'LESSON_NO_LONGER_RELEASABLE' },
      });
    }
    if (reason.includes('delivery_lesson_releases require an active delivery')) {
      throw new ConflictException(API_ERROR.DELIVERY_NOT_ACTIVE);
    }
    if (reason.includes('delivery_lesson_releases require current course access')) {
      throw new ForbiddenException(API_ERROR.SUBSCRIPTION_EXPIRED);
    }
  }
}
