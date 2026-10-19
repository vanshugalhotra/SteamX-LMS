import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type ClassSection, UserType } from '../generated/prisma/client.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { ActiveSchoolService } from '../common/tenancy/active-school.service.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { ClassSectionsRepository } from './class-sections.repository.js';
import { ClassSectionsService } from './class-sections.service.js';

describe('ClassSectionsService', () => {
  // Assignments cannot reference a section outside the student's school.
  it('returns not found when a section is not in the requested school', async () => {
    const { service } = createService({ section: null });

    await expect(service.assertInSchool('section-1', 'school-2')).rejects.toMatchObject({
      response: API_ERROR.NOT_FOUND,
    });
  });

  // Class/section uniqueness failures have a stable domain response.
  it('maps duplicate class sections to a conflict', async () => {
    const { service, repository } = createService();
    repository.create.mockRejectedValue(
      Object.assign(new Error('private index detail'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      }),
    );

    await expect(
      service.create(actor, { className: 'Grade 5', sectionName: 'A' }),
    ).rejects.toMatchObject({ response: API_ERROR.CLASS_SECTION_EXISTS });
  });

  // Empty section patches are rejected before any update is attempted.
  it('rejects an empty section update', async () => {
    const { service } = createService();

    await expect(service.update(actor, 'section-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // Deleting a section referenced by students is reported as a domain conflict.
  it('rejects deletion of a section that is in use', async () => {
    const { service, repository } = createService();
    repository.delete.mockRejectedValue(
      Object.assign(new Error('foreign key details'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2003',
      }),
    );

    await expect(service.delete(actor, 'section-1')).rejects.toMatchObject({
      response: API_ERROR.CLASS_SECTION_IN_USE,
    });
  });
});

const actor: AuthContext = {
  userId: 'admin-1',
  steamxId: 'GVSADMIN1',
  name: 'School Admin',
  roleKey: 'school_admin',
  userType: UserType.SCHOOL_STAFF,
  schoolId: 'school-1',
  mustChangePassword: false,
};

const sectionRecord: ClassSection = {
  id: 'section-1',
  schoolId: 'school-1',
  className: 'Grade 5',
  sectionName: 'A',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createService(options: { section?: ClassSection | null } = {}) {
  const repository = {
    create: vi.fn(),
    findById: vi
      .fn()
      .mockResolvedValue(options.section === undefined ? sectionRecord : options.section),
    delete: vi.fn(),
  };
  const activeSchool = {
    resolveSchool: vi.fn().mockResolvedValue({ id: 'school-1', code: 'GVS' }),
  };
  const logger = { info: vi.fn() };

  return {
    service: new ClassSectionsService(
      repository as unknown as ClassSectionsRepository,
      activeSchool as unknown as ActiveSchoolService,
      logger as never,
    ),
    repository,
  };
}
