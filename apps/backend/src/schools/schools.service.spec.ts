import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SchoolStatus, UserType, type School } from '../generated/prisma/client.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { SchoolsRepository } from './schools.repository.js';
import { SchoolsService } from './schools.service.js';

describe('SchoolsService', () => {
  // Only platform staff may create a tenant, even if school staff otherwise have management grants.
  it('rejects school creation by school staff', async () => {
    const { service } = createService();

    await expect(service.create(actor(UserType.SCHOOL_STAFF), schoolInput)).rejects.toMatchObject({
      response: API_ERROR.SCHOOL_FORBIDDEN,
    });
  });

  // Database uniqueness failures are exposed as the school-code conflict, not raw Prisma details.
  it('maps duplicate school codes to the school-code conflict', async () => {
    const { service, repository } = createService();
    repository.create.mockRejectedValue(
      Object.assign(new Error('private constraint detail'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      }),
    );

    await expect(service.create(actor(UserType.PLATFORM_STAFF), schoolInput)).rejects.toMatchObject(
      { response: API_ERROR.SCHOOL_CODE_EXISTS },
    );
  });

  // Empty patches fail rather than producing a success-shaped no-op.
  it('rejects an empty school update', async () => {
    const { service } = createService();

    await expect(
      service.update(actor(UserType.PLATFORM_STAFF), 'school-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Repeating the current status returns the school without issuing another update.
  it('returns a school unchanged when its status already matches', async () => {
    const { service } = createService();

    const result = await service.updateStatus(
      actor(UserType.PLATFORM_STAFF),
      'school-1',
      SchoolStatus.ACTIVE,
    );
    expect(result.status).toBe(SchoolStatus.ACTIVE);
    expect(result.status).toBe(SchoolStatus.ACTIVE);
  });
});

const schoolInput = {
  code: 'GVS',
  name: 'Green Valley School',
  city: 'Springfield',
  state: 'CA',
  postalCode: '90210',
  country: 'US',
};

function actor(userType: UserType): AuthContext {
  return {
    userId: 'caller-1',
    steamxId: 'CALLER001',
    name: 'Caller',
    roleKey: 'school_admin',
    userType,
    schoolId: userType === UserType.PLATFORM_STAFF ? null : 'school-1',
    mustChangePassword: false,
  };
}

function createService() {
  const repository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(schoolRecord),
    update: vi.fn(),
  };
  const logger = { setContext: vi.fn(), info: vi.fn() };

  return {
    service: new SchoolsService(repository as unknown as SchoolsRepository, logger as never),
    repository,
  };
}

const schoolRecord: School = {
  id: 'school-1',
  code: 'GVS',
  name: 'Green Valley School',
  streetAddress: null,
  city: 'Springfield',
  state: 'CA',
  postalCode: '90210',
  country: 'US',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  status: SchoolStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};
