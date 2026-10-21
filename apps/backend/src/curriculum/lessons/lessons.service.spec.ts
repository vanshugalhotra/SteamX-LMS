import { describe, expect, it, vi } from 'vitest';
import { ContentStatus, LessonAudience, UserType } from '../../generated/prisma/client.js';
import type { Lesson } from '../../generated/prisma/client.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { LessonsRepository } from './lessons.repository.js';
import { LessonsService } from './lessons.service.js';

describe('LessonsService', () => {
  it('logs status changes with actor and old and new statuses', async () => {
    const { service, repository, logger } = createService();
    repository.findById.mockResolvedValue({
      ...lessonRecord,
      module: { status: ContentStatus.ACTIVE },
    });
    repository.updateStatus.mockResolvedValue({
      ...lessonRecord,
      status: ContentStatus.ACTIVE,
      module: { status: ContentStatus.ACTIVE },
    });

    await service.updateStatus(actor, lessonRecord.id, ContentStatus.ACTIVE);

    expect(logger.info).toHaveBeenCalledWith(
      {
        actorId: actor.userId,
        lessonId: lessonRecord.id,
        oldStatus: ContentStatus.DRAFT,
        newStatus: ContentStatus.ACTIVE,
      },
      'Lesson status changed',
    );
  });

  it('maps dependent-record delete violations to RESOURCE_IN_USE with lesson guidance', async () => {
    const { service, repository } = createService();
    repository.delete.mockRejectedValue(
      Object.assign(new Error('private database detail'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2003',
      }),
    );

    await expect(service.delete(actor, lessonRecord.id)).rejects.toMatchObject({
      response: {
        code: API_ERROR.RESOURCE_IN_USE.code,
        message: 'A lesson with content blocks must have its blocks removed first.',
      },
    });
  });
});

const actor: AuthContext = {
  userId: '550e8400-e29b-41d4-a716-446655440001',
  steamxId: 'ADMIN001',
  name: 'Admin',
  roleKey: 'admin',
  userType: UserType.PLATFORM_STAFF,
  schoolId: null,
  mustChangePassword: false,
};

const lessonRecord: Lesson = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  moduleId: '550e8400-e29b-41d4-a716-446655440004',
  courseId: '550e8400-e29b-41d4-a716-446655440005',
  title: 'Test lesson',
  position: 1,
  status: ContentStatus.DRAFT,
  audience: LessonAudience.TEACHER_ONLY,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createService() {
  const repository = {
    create: vi.fn(),
    findManyForModule: vi.fn(),
    reorder: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  };
  const logger = { setContext: vi.fn(), info: vi.fn() };

  return {
    service: new LessonsService(repository as unknown as LessonsRepository, logger as never),
    repository,
    logger,
  };
}
