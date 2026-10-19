import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { Env } from '../../src/config/env.schema.js';
import { PrismaClient, type UserStatus } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  TENANCY_TEST_PASSWORD,
  createTwoSchoolFixture,
  type TwoSchoolFixture,
} from './factories/fixtures.js';
import { createTestApp } from './create-test-app.js';
import { cleanupFixtures } from './setup/cleanup.js';
import { grantPermissions } from './setup/grant-permissions.js';

export type UsersE2eContext = {
  app: INestApplication<App>;
  prisma: PrismaService;
  setupClient: PrismaClient;
  fixture: TwoSchoolFixture;
  origin: string;
  createdUserIds: string[];
  createdClassSectionIds: string[];
  close: () => Promise<void>;
  createTeacher: (cookie: string, body: object) => request.Test;
  createStudent: (cookie: string, body: object) => request.Test;
  listUsers: (cookie: string, query?: Record<string, string | number>) => request.Test;
  getUser: (cookie: string, id: string) => request.Test;
  updateUser: (cookie: string, id: string, body: object) => request.Test;
  updateUserStatus: (cookie: string, id: string, status: UserStatus) => request.Test;
  renameSteamxId: (cookie: string, id: string, steamxId: string) => request.Test;
  resetUserPassword: (cookie: string, id: string, newPassword: string) => request.Test;
  trackUser: <T extends { id: string }>(user: T) => T;
};

export async function startUsersE2e(): Promise<UsersE2eContext> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Users e2e tests require DATABASE_URL.');
  }

  const setupPool = new Pool({ connectionString: databaseUrl });
  const setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
  await setupClient.$connect();
  const grant = await grantPermissions(setupClient, 'teacher', [
    PERMISSION.USER_READ,
    PERMISSION.USER_CREATE_TEACHER,
    PERMISSION.USER_STEAMX_ID_UPDATE,
    PERMISSION.USER_UPDATE,
    PERMISSION.USER_DEACTIVATE,
    PERMISSION.USER_PASSWORD_RESET,
  ]);

  const app = (await createTestApp(AppModule)) as INestApplication<App>;
  const prisma = app.get(PrismaService);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
  if (!origin) {
    throw new Error('Users e2e tests require a configured CORS_ORIGINS entry.');
  }
  const fixture = await createTwoSchoolFixture(prisma);
  const createdUserIds: string[] = [];
  const createdClassSectionIds: string[] = [];

  const get = (route: string, cookie: string) =>
    request(app.getHttpServer()).get(route).set('Cookie', cookie);
  const patch = (route: string, cookie: string) =>
    request(app.getHttpServer()).patch(route).set('Origin', origin).set('Cookie', cookie);

  return {
    app,
    prisma,
    setupClient,
    fixture,
    origin,
    createdUserIds,
    createdClassSectionIds,
    trackUser<T extends { id: string }>(user: T): T {
      createdUserIds.push(user.id);
      return user;
    },
    createTeacher: (cookie, body) =>
      request(app.getHttpServer())
        .post('/api/v1/users/teachers')
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send(body),
    createStudent: (cookie, body) =>
      request(app.getHttpServer())
        .post('/api/v1/users/students')
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send(body),
    listUsers: (cookie, query = {}) => get('/api/v1/users', cookie).query(query),
    getUser: (cookie, id) => get(`/api/v1/users/${id}`, cookie),
    updateUser: (cookie, id, body) => patch(`/api/v1/users/${id}`, cookie).send(body),
    updateUserStatus: (cookie, id, status) =>
      patch(`/api/v1/users/${id}/status`, cookie).send({ status }),
    renameSteamxId: (cookie, id, steamxId) =>
      patch(`/api/v1/users/${id}/steamx-id`, cookie).send({ steamxId }),
    resetUserPassword: (cookie, id, newPassword) =>
      request(app.getHttpServer())
        .post(`/api/v1/users/${id}/reset-password`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({ newPassword }),
    async close() {
      await cleanupFixtures(
        prisma,
        [
          fixture.admin.id,
          fixture.schoolA.teacher.id,
          fixture.schoolA.student.id,
          fixture.schoolB.teacher.id,
          fixture.schoolB.student.id,
          ...createdUserIds,
        ],
        [fixture.schoolA.school.id, fixture.schoolB.school.id],
        [fixture.schoolA.section.id, fixture.schoolB.section.id, ...createdClassSectionIds],
      );
      await app.close();
      await grant.revoke();
      await setupClient.$disconnect();
      await setupPool.end();
    },
  };
}

export function createTeacherBody(
  schoolId: string,
  name = 'Created Teacher',
  fields: Record<string, unknown> = {},
) {
  return { name, password: TENANCY_TEST_PASSWORD, schoolId, ...fields };
}

export function createStudentBody(
  schoolId: string,
  classSectionId: string,
  name = 'Created Student',
  fields: Record<string, unknown> = {},
) {
  return { name, password: TENANCY_TEST_PASSWORD, schoolId, classSectionId, ...fields };
}
