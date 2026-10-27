// Coordinates lesson-content reads and full-tree saves.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { PinoLogger } from 'nestjs-pino';
import { AssetsService } from '../../assets/assets.service.js';
import { assertPlatformStaff } from '../../auth/assert-platform-staff.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { LessonContentResponseDto } from './dto/lesson-content-response.dto.js';
import type { SaveLessonContentDto } from './dto/save-lesson-content.dto.js';
import { findAssetReferenceIssues } from './asset-reference-issues.js';
import { buildBlockTree } from './tree/build-block-tree.js';
import { flattenBlocks, walkBlocks } from './tree/walk-blocks.js';
import { collectAssetIds, validateLessonContent } from './validation/validate-lesson-content.js';
import { toLessonContentResponse } from './lesson-content.mapper.js';
import { LessonContentRepository } from './lesson-content.repository.js';
import type { Issue } from './validation/types.js';

/**
 * Two rare save races are deliberately not handled: another lesson can claim a colliding block
 * UUID at the same instant, and an asset can be deleted between reference validation and insert.
 * Both surface as a logged generic 500.
 */
@Injectable()
export class LessonContentService {
  /** Inject the database, asset lookup, and logger used by lesson-content operations. */
  constructor(
    private readonly content: LessonContentRepository,
    private readonly assets: AssetsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LessonContentService.name);
  }

  /**
   * Return the lesson's blocks, version, and referenced asset summaries for the builder.
   */
  async findByLessonId(actor: AuthContext, id: string): Promise<LessonContentResponseDto> {
    assertPlatformStaff(actor);

    const { lessonVersion, blocks: blockRows } = await this.content.findSnapshot(id);
    if (!lessonVersion) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    const blocks = buildBlockTree(blockRows);
    const assetIds = collectAssetIds(blocks);
    const summaries = await this.assets.getSummaries(assetIds);
    return toLessonContentResponse(lessonVersion.contentVersion, blocks, summaries);
  }

  /** Validate and replace all lesson blocks, or return the current content for an unchanged save. */
  async saveByLessonId(
    actor: AuthContext,
    id: string,
    body: SaveLessonContentDto,
  ): Promise<LessonContentResponseDto> {
    assertPlatformStaff(actor);

    const validation = validateLessonContent({ blocks: body.blocks });
    if (!validation.ok) {
      throw new BadRequestException({
        ...API_ERROR.INVALID_LESSON_CONTENT,
        details: validation.issues,
      });
    }
    const incoming = validation.blocks;

    // Keep the lock, checks, replacement, and version update in one transaction.
    return this.content.transaction(async (tx) => {
      const lesson = await this.content.lockLesson(tx, id);
      if (!lesson) throw new NotFoundException(API_ERROR.NOT_FOUND);

      const stored = buildBlockTree(await this.content.findBlocks(id, tx));
      const assetIds = collectAssetIds(incoming);
      let blockCount = 0;
      walkBlocks(incoming, () => blockCount++);

      // Check for a retry before the version check, so a successful retry stays safe.
      if (isDeepStrictEqual(incoming, stored)) {
        const summaries = await this.assets.getSummaries(assetIds, tx);
        const response = toLessonContentResponse(lesson.content_version, stored, summaries);
        this.logSave(actor.userId, id, blockCount, assetIds.length, false, lesson.content_version);
        return response;
      }

      if (body.expectedVersion !== lesson.content_version) {
        this.logger.info(
          {
            lessonId: id,
            actorId: actor.userId,
            expectedVersion: body.expectedVersion,
            currentVersion: lesson.content_version,
          },
          'Lesson content version conflict',
        );
        throw new ConflictException({
          ...API_ERROR.VERSION_CONFLICT,
          details: { currentVersion: lesson.content_version },
        });
      }

      const pathsById = new Map<string, string>();
      walkBlocks(incoming, ({ block, path }) => pathsById.set(block.id, path));
      const incomingIds = [...pathsById.keys()];
      const foreignIds = await this.content.findForeignBlockIds(tx, id, incomingIds);
      if (foreignIds.length > 0) {
        const foreignIdSet = new Set(foreignIds.map(({ id: blockId }) => blockId));
        const issues: Issue[] = [];
        for (const [blockId, path] of pathsById) {
          if (foreignIdSet.has(blockId)) {
            issues.push({
              path,
              code: 'BLOCK_ID_IN_USE',
              message: 'The block id is already used by another lesson.',
            });
          }
        }
        throw new BadRequestException({
          ...API_ERROR.INVALID_LESSON_CONTENT,
          details: issues,
        });
      }

      const summaries = await this.assets.getSummaries(assetIds, tx);
      const existingAssetIds = new Set(collectAssetIds(stored));
      const assetIssues = findAssetReferenceIssues(incoming, summaries, existingAssetIds);
      if (assetIssues.length > 0) {
        throw new BadRequestException({
          ...API_ERROR.INVALID_LESSON_CONTENT,
          details: assetIssues,
        });
      }

      const flattened = flattenBlocks(incoming, id);
      await this.content.deleteBlocks(tx, id);
      await this.content.createTopLevelBlocks(tx, flattened.topLevel);
      await this.content.createChildBlocks(tx, flattened.children);
      const updated = await this.content.incrementVersion(tx, id);
      const response = toLessonContentResponse(updated.contentVersion, incoming, summaries);
      this.logSave(actor.userId, id, blockCount, assetIds.length, true, updated.contentVersion);
      return response;
    });
  }

  /** Log save counts and outcome without logging lesson content. */
  private logSave(
    actorId: string,
    lessonId: string,
    blockCount: number,
    assetCount: number,
    changed: boolean,
    newVersion: number,
  ): void {
    this.logger.info(
      { lessonId, actorId, blockCount, assetCount, changed, newVersion },
      'Lesson content saved',
    );
  }
}
