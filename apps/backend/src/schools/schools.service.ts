import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, SchoolStatus, UserType } from '../generated/prisma/client.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { SchoolListQueryDto } from './dto/school-list-query.dto.js';
import type { SchoolResponseDto } from './dto/school-response.dto.js';
import type { UpdateSchoolDto } from './dto/update-school.dto.js';
import { SchoolsRepository } from './schools.repository.js';

const NOT_FOUND = { code: 'NOT_FOUND', message: 'Resource not found' };
const EMPTY_UPDATE = {
  code: 'VALIDATION_ERROR',
  message: 'Validation failed',
  details: [{ field: 'body', errors: ['At least one field must be provided'] }],
};

@Injectable()
export class SchoolsService {
  constructor(
    private readonly schools: SchoolsRepository,
    private readonly logger: PinoLogger,
  ) {}

  async create(actor: AuthContext, body: CreateSchoolDto): Promise<SchoolResponseDto> {
    if (actor.userType !== UserType.PLATFORM_STAFF) {
      // even if a user has SCHOOL_MANAGE permission, they cannot create a school if they are not PLATFORM_STAFF
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    try {
      const school = await this.schools.create(body);
      this.logger.info({ actorId: actor.userId, schoolId: school.id }, 'School created');
      return this.toResponse(school);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'SCHOOL_CODE_EXISTS',
          message: 'School code already exists',
        });
      }
      throw error;
    }
  }

  async findMany(
    actor: AuthContext,
    query: SchoolListQueryDto,
  ): Promise<PaginationResponseDto<SchoolResponseDto>> {
    const scope = resolveSchoolScope(actor);
    const { items, total } = await this.schools.findMany(scope, query);
    return paginate(
      items.map((school) => this.toResponse(school)),
      query.page,
      query.limit,
      total,
    );
  }

  async findById(actor: AuthContext, id: string): Promise<SchoolResponseDto> {
    const scope = resolveSchoolScope(actor);
    const school = await this.schools.findById(id, scope);
    if (!school) {
      throw new NotFoundException(NOT_FOUND);
    }
    return this.toResponse(school);
  }

  async update(actor: AuthContext, id: string, body: UpdateSchoolDto): Promise<SchoolResponseDto> {
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(EMPTY_UPDATE);
    }

    const scope = resolveSchoolScope(actor);
    const school = await this.schools.update(id, scope, body);
    if (!school) {
      throw new NotFoundException(NOT_FOUND);
    }

    this.logger.info({ actorId: actor.userId, schoolId: school.id }, 'School updated');
    return this.toResponse(school);
  }

  async updateStatus(
    actor: AuthContext,
    id: string,
    status: SchoolStatus,
  ): Promise<SchoolResponseDto> {
    const scope = resolveSchoolScope(actor);
    const current = await this.schools.findById(id, scope);
    if (!current) {
      throw new NotFoundException(NOT_FOUND);
    }
    if (current.status === status) {
      return this.toResponse(current);
    }

    const school = await this.schools.updateStatus(id, scope, status);
    if (!school) {
      throw new NotFoundException(NOT_FOUND);
    }

    this.logger.info({ actorId: actor.userId, schoolId: school.id }, 'School status changed');
    return this.toResponse(school);
  }

  private toResponse(school: {
    id: string;
    code: string;
    name: string;
    streetAddress: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    status: SchoolStatus;
    createdAt: Date;
    updatedAt: Date;
  }): SchoolResponseDto {
    return {
      id: school.id,
      code: school.code,
      name: school.name,
      streetAddress: school.streetAddress,
      city: school.city,
      state: school.state,
      postalCode: school.postalCode,
      country: school.country,
      contactName: school.contactName,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      status: school.status,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
    };
  }
}
