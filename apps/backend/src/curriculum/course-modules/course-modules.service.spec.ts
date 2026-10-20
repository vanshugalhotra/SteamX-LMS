import { describe, expect, it, vi } from 'vitest';
import { ContentStatus, UserType } from '../../generated/prisma/client.js';
import type { Module as CourseModuleRecord } from '../../generated/prisma/client.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { CourseModulesRepository } from './course-modules.repository.js';
import { CourseModulesService } from './course-modules.service.js';

describe('CourseModulesService', () => {
  it('rejects activation when the parent course is not active', async () => {
    const { service, repository } = createService();
    repository.findById.mockResolvedValue({
      ...moduleRecord,
      course: { status: ContentStatus.DRAFT },
    });

    await expect(
      service.updateStatus(actor, moduleRecord.id, ContentStatus.ACTIVE),
    ).rejects.toMatchObject({
      response: API_ERROR.PARENT_NOT_ACTIVE,
    });
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('logs status changes with actor and previous and next statuses', async () => {
    const { service, repository, logger } = createService();
    repository.updateStatus.mockResolvedValue({
      ...moduleRecord,
      status: ContentStatus.ACTIVE,
      course: { status: ContentStatus.ACTIVE },
    });

    await service.updateStatus(actor, moduleRecord.id, ContentStatus.ACTIVE);

    expect(logger.info).toHaveBeenCalledWith(
      {
        actorId: actor.userId,
        moduleId: moduleRecord.id,
        oldStatus: ContentStatus.DRAFT,
        newStatus: ContentStatus.ACTIVE,
      },
      'Course module status changed',
    );
  });

  it('maps foreign-key delete violations to RESOURCE_IN_USE', async () => {
    const { service, repository } = createService();
    repository.delete.mockRejectedValue(
      Object.assign(new Error('private database detail'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2003',
      }),
    );

    await expect(service.delete(actor, moduleRecord.id)).rejects.toMatchObject({
      response: API_ERROR.RESOURCE_IN_USE,
    });
  });

  it('logs successful deletion with actor, module ID, and title', async () => {
    const { service, repository, logger } = createService();
    repository.delete.mockResolvedValue({ id: moduleRecord.id, title: moduleRecord.title });

    await expect(service.delete(actor, moduleRecord.id)).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      {
        actorId: actor.userId,
        moduleId: moduleRecord.id,
        title: moduleRecord.title,
      },
      'Course module deleted',
    );
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

const moduleRecord: CourseModuleRecord = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  courseId: '550e8400-e29b-41d4-a716-446655440004',
  title: 'Test module',
  position: 1,
  status: ContentStatus.DRAFT,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createService() {
  const repository = {
    create: vi.fn(),
    findManyForCourse: vi.fn(),
    reorder: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      ...moduleRecord,
      course: { status: ContentStatus.ACTIVE },
    }),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  };
  const logger = { setContext: vi.fn(), info: vi.fn() };

  return {
    service: new CourseModulesService(
      repository as unknown as CourseModulesRepository,
      logger as never,
    ),
    repository,
    logger,
  };
}
