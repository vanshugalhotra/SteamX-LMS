import {
  Controller,
  Get,
  INestApplication,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Body,
  Patch,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module.js';
import { CurrentAuth } from '../../src/auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../src/auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { AuthContext } from '../../src/auth/types/auth-context.js';
import type { Env } from '../../src/config/env.schema.js';
import { configureApp } from '../../src/configure-app.js';
import { schoolFilter, resolveSchoolScope } from '../../src/common/tenancy/school-scope.js';
import { PrismaModule } from '../../src/prisma/prisma.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import { grantPermissions } from '../support/setup/grant-permissions.js';
import { loginAsCookie as loginAs } from '../support/login.js';

type ScopedUser = {
  id: string;
  name: string;
  schoolId: string | null;
};

@Injectable()
class TenancyTestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUser(id: string, scope: string | undefined): Promise<ScopedUser | null> {
    return this.prisma.user.findFirst({
      where: { id, ...schoolFilter(scope) },
      select: { id: true, name: true, schoolId: true },
    });
  }

  updateUser(id: string, scope: string | undefined, name: string): Promise<ScopedUser> {
    return this.prisma.user.update({
      where: { id, ...schoolFilter(scope) },
      data: { name },
      select: { id: true, name: true, schoolId: true },
    });
  }
}

@Injectable()
class TenancyTestService {
  constructor(private readonly repository: TenancyTestRepository) {}

  async getUser(auth: AuthContext, id: string): Promise<ScopedUser> {
    const scope = resolveSchoolScope(auth);
    const user = await this.repository.findUser(id, scope);
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found' });
    }
    return user;
  }

  updateUser(auth: AuthContext, id: string, name: string): Promise<ScopedUser> {
    const scope = resolveSchoolScope(auth);
    return this.repository.updateUser(id, scope, name);
  }
}

@Controller('test-scope/users')
class TenancyTestController {
  constructor(private readonly service: TenancyTestService) {}

  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Get(':id')
  getUser(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<ScopedUser> {
    return this.service.getUser(auth, id);
  }

  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Patch(':id')
  updateUser(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { name: string },
  ): Promise<ScopedUser> {
    return this.service.updateUser(auth, id, body.name);
  }
}

@Module({
  imports: [AppModule, PrismaModule],
  controllers: [TenancyTestController],
  providers: [TenancyTestService, TenancyTestRepository],
})
class TenancyTestModule {}

describe('school tenancy scope (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let testClient: PrismaClient;
  let pool: Pool;
  let fixture: TwoSchoolFixture;
  let revokeTeacherPermission: (() => Promise<void>) | undefined;
  let origin: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Tenancy e2e tests require DATABASE_URL.');
    }

    pool = new Pool({ connectionString: databaseUrl });
    testClient = new PrismaClient({ adapter: new PrismaPg(pool) });
    await testClient.$connect();
    const grant = await grantPermissions(testClient, 'teacher', [PERMISSION.USER_PASSWORD_RESET]);
    revokeTeacherPermission = grant.revoke;

    const moduleFixture = await Test.createTestingModule({
      imports: [TenancyTestModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Tenancy e2e tests require a configured CORS_ORIGINS entry.');
    }
    fixture = await createTwoSchoolFixture(prisma);
  });

  afterAll(async () => {
    if (fixture) {
      const userIds = [
        fixture.admin.id,
        fixture.schoolA.teacher.id,
        fixture.schoolA.student.id,
        fixture.schoolB.teacher.id,
        fixture.schoolB.student.id,
      ];
      await prisma.$transaction(async (tx) => {
        await tx.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.classSection.deleteMany({
          where: { id: { in: [fixture.schoolA.section.id, fixture.schoolB.section.id] } },
        });
        await tx.school.deleteMany({
          where: { id: { in: [fixture.schoolA.school.id, fixture.schoolB.school.id] } },
        });
      });
    }

    await app?.close();
    await revokeTeacherPermission?.();
    await testClient?.$disconnect();
    await pool?.end();
  });

  function getUser(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/v1/test-scope/users/${id}`).set('Cookie', cookie);
  }

  function patchUser(cookie: string, id: string, name: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/test-scope/users/${id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ name });
  }

  it('scopes a teacher to their school and makes foreign and missing ids indistinguishable', async () => {
    const cookie = await loginAs(app, fixture.schoolA.teacher);
    const own = await getUser(cookie, fixture.schoolA.student.id).expect(200);
    expect(own.body).toMatchObject({ id: fixture.schoolA.student.id });

    const foreign = await getUser(cookie, fixture.schoolB.student.id).expect(404);
    const missing = await getUser(cookie, randomUUID()).expect(404);
    const { requestId: foreignRequestId, ...foreignBody } = foreign.body;
    const { requestId: missingRequestId, ...missingBody } = missing.body;

    expect(foreignBody).toEqual(missingBody);
    expect(foreignBody).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
    expect(foreignRequestId).not.toBe(missingRequestId);
  });

  it('does not update a foreign student for a school teacher', async () => {
    const cookie = await loginAs(app, fixture.schoolA.teacher);
    const original = await prisma.user.findUniqueOrThrow({
      where: { id: fixture.schoolB.student.id },
      select: { name: true },
    });

    await patchUser(cookie, fixture.schoolB.student.id, 'Unauthorized rename').expect(404);

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: fixture.schoolB.student.id },
        select: { name: true },
      }),
    ).resolves.toEqual(original);
  });

  it('allows platform staff to access and update users in both schools', async () => {
    const cookie = await loginAs(app, fixture.admin);

    await getUser(cookie, fixture.schoolA.student.id)
      .expect(200)
      .then(({ body }) => expect(body.id).toBe(fixture.schoolA.student.id));
    await getUser(cookie, fixture.schoolB.student.id)
      .expect(200)
      .then(({ body }) => expect(body.id).toBe(fixture.schoolB.student.id));

    await patchUser(cookie, fixture.schoolB.student.id, 'Admin renamed student')
      .expect(200)
      .then(({ body }) => expect(body.name).toBe('Admin renamed student'));
  });

  it('checks permission before applying tenancy scope', async () => {
    const cookie = await loginAs(app, fixture.schoolA.student);

    await getUser(cookie, fixture.schoolB.student.id).expect(403);
  });

  it('rejects requests without a cookie', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/test-scope/users/${fixture.schoolA.student.id}`)
      .expect(401);
  });
});
