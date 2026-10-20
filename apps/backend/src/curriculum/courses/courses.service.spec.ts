import { describe, expect, it, vi } from 'vitest';
import { ContentStatus, UserType } from '../../generated/prisma/client.js';
import type { Course } from '../../generated/prisma/client.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { CoursesRepository } from './courses.repository.js';
import { CoursesService } from './courses.service.js';

describe('CoursesService', () => {
  it.each([
    [UserType.SCHOOL_STAFF, 'teacher'],
    [UserType.STUDENT, 'student'],
  ])('rejects %s role %s from curriculum service methods', async (userType, roleKey) => {
    const { service, repository } = createService();
    const nonAdmin = {
      ...actor,
      userType,
      roleKey,
      schoolId: '550e8400-e29b-41d4-a716-446655440002',
    };

    await expect(service.findMany(nonAdmin, { page: 1, limit: 20 })).rejects.toMatchObject({
      response: API_ERROR.FORBIDDEN,
    });
    expect(repository.findMany).not.toHaveBeenCalled();
  });

  it('allows platform staff regardless of role key', async () => {
    const platformStaff = { ...actor, roleKey: 'platform_content_manager' };
    const { service, repository } = createService();
    repository.findMany.mockResolvedValue({ items: [courseRecord], total: 1 });

    await expect(service.findMany(platformStaff, { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [{ id: courseRecord.id }],
      total: 1,
    });
    expect(repository.findMany).toHaveBeenCalledOnce();
  });

  it('maps database content-status trigger violations to the transition conflict', async () => {
    const { service, repository } = createService();
    repository.updateStatus.mockRejectedValue(
      Object.assign(new Error('private trigger detail'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2004',
        meta: {
          driverAdapterError: {
            cause: { originalCode: '23000' },
          },
        },
      }),
    );

    await expect(
      service.updateStatus(actor, courseRecord.id, ContentStatus.ACTIVE),
    ).rejects.toMatchObject({ response: API_ERROR.INVALID_STATUS_TRANSITION });
  });

  it('logs each status change with its actor and old and new values', async () => {
    const activeCourse = { ...courseRecord, status: ContentStatus.ACTIVE };
    const { service, repository, logger } = createService();
    repository.updateStatus.mockResolvedValue(activeCourse);

    await service.updateStatus(actor, courseRecord.id, ContentStatus.ACTIVE);

    expect(logger.info).toHaveBeenCalledWith(
      {
        actorId: actor.userId,
        courseId: courseRecord.id,
        oldStatus: ContentStatus.DRAFT,
        newStatus: ContentStatus.ACTIVE,
      },
      'Course status changed',
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

const courseRecord: Course = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test course',
  description: null,
  status: ContentStatus.DRAFT,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createService() {
  const repository = {
    create: vi.fn(),
    findMany: vi.fn(),
    findById: vi.fn().mockResolvedValue(courseRecord),
    update: vi.fn(),
    updateStatus: vi.fn(),
  };
  const logger = { setContext: vi.fn(), info: vi.fn() };

  return {
    service: new CoursesService(repository as unknown as CoursesRepository, logger as never),
    repository,
    logger,
  };
}
