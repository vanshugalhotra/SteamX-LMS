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

  /** Lists the active course outline and release state for a delivery. */
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

  /** Releases one eligible lesson; duplicate requests retain the original timestamp. */
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

  /** Removes one release without affecting lesson completion records. */
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

  /** Releases all eligible lessons in one module, skipping ineligible content. */
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

  /** Rejects release writes when the delivery is inactive. */
  private assertDeliveryActive(status: DeliveryStatus): void {
    if (status !== DeliveryStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.DELIVERY_NOT_ACTIVE);
    }
  }

  /** Checks lesson audience and both content statuses before release. */
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

  /** Maps release-trigger races to their documented API errors. */
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
