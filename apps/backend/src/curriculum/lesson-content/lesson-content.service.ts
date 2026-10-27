import { Injectable, NotFoundException } from '@nestjs/common';
import { AssetsService } from '../../assets/assets.service.js';
import { assertPlatformStaff } from '../../auth/assert-platform-staff.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { LessonContentResponseDto } from './dto/lesson-content-response.dto.js';
import { buildBlockTree } from './tree/build-block-tree.js';
import { collectAssetIds } from './validation/validate-lesson-content.js';
import { toLessonContentResponse } from './lesson-content.mapper.js';
import { LessonContentRepository } from './lesson-content.repository.js';

@Injectable()
export class LessonContentService {
  constructor(
    private readonly content: LessonContentRepository,
    private readonly assets: AssetsService,
  ) {}

  /**
   * Admin/builder read only. Delivery readers need a separate release-aware endpoint.
   * Never grant curriculum.read to teacher or student roles.
   */
  async findByLessonId(actor: AuthContext, id: string): Promise<LessonContentResponseDto> {
    assertPlatformStaff(actor);

    const lessonVersion = await this.content.findVersion(id);
    if (!lessonVersion) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    const blocks = buildBlockTree(await this.content.findBlocks(id));
    const assetIds = collectAssetIds(blocks);
    const summaries = await this.assets.getSummaries(assetIds);
    return toLessonContentResponse(lessonVersion.contentVersion, blocks, summaries);
  }
}
