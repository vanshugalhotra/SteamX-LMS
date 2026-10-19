import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PasswordService } from '../../src/auth/services/password.service.js';
import type { Env } from '../../src/config/env.schema.js';
import { PrismaClient, UserStatus, UserType } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import type { Response, Test } from 'supertest';
import request from 'supertest';
import { grantPermissions } from './setup/grant-permissions.js';
import type { PermissionKey } from '../../src/auth/permissions.js';

export const INVARIANT_ADMIN = {
  steamxId: 'INTV-ADMIN001',
  password: 'Invariant admin password 2026!',
};

export type ApiRoute = { method: string; path: string };

export type InvariantApi = {
  app: INestApplication;
  prisma: PrismaService;
  origin: string;
  admin: { id: string; steamxId: string; password: string };
  routes: ApiRoute[];
  send: (
    method: string,
    path: string,
    options?: { cookie?: string; body?: object | string; query?: Record<string, string | number> },
  ) => Promise<Response>;
  login: (credentials?: { steamxId: string; password: string }) => Promise<{
    cookie: string;
    response: Response;
  }>;
  close: () => Promise<void>;
  seen: Response[];
};

export async function startInvariantApi(
  options: {
    adminMustChangePassword?: boolean;
    teacherPermissions?: PermissionKey[];
  } = {},
): Promise<InvariantApi> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Invariant tests require DATABASE_URL.');
  }
  const setupPool = new Pool({ connectionString: databaseUrl });
  const setupClient = new PrismaClient({ adapter: new PrismaPg(setupPool) });
  await setupClient.$connect();
  const permissionGrant =
    options.teacherPermissions && options.teacherPermissions.length > 0
      ? await grantPermissions(setupClient, 'teacher', options.teacherPermissions)
      : undefined;
  const app = await createTestApp();
  const prisma = app.get(PrismaService);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
  if (!origin) {
    await app.close();
    throw new Error('Invariant tests require a configured CORS_ORIGINS entry.');
  }
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: 'admin' },
    select: { id: true },
  });
  const passwordHash = await new PasswordService().hash(INVARIANT_ADMIN.password);
  const admin = await prisma.user.create({
    data: {
      steamxId: INVARIANT_ADMIN.steamxId,
      name: 'Invariant Platform Administrator',
      passwordHash,
      userType: UserType.PLATFORM_STAFF,
      schoolId: null,
      roleId: role.id,
      status: UserStatus.ACTIVE,
      mustChangePassword: options.adminMustChangePassword ?? false,
    },
    select: { id: true, steamxId: true },
  });
  const seen: Response[] = [];
  const routes = enumerateRoutes(app);

  async function send(
    method: string,
    path: string,
    options: {
      cookie?: string;
      body?: object | string;
      query?: Record<string, string | number>;
    } = {},
  ): Promise<Response> {
    const upperMethod = method.toUpperCase();
    const route = request(app.getHttpServer());
    let test: Test;
    switch (upperMethod) {
      case 'GET':
        test = route.get(path);
        break;
      case 'POST':
        test = route.post(path);
        break;
      case 'PATCH':
        test = route.patch(path);
        break;
      case 'DELETE':
        test = route.delete(path);
        break;
      case 'PUT':
        test = route.put(path);
        break;
      default:
        throw new Error(`Invariant HTTP helper does not support method ${upperMethod}.`);
    }
    if (upperMethod !== 'GET') {
      test.set('Origin', origin);
    }
    if (options.cookie) {
      test.set('Cookie', options.cookie);
    }
    if (options.query) {
      test.query(options.query);
    }
    if (options.body !== undefined) {
      test.send(options.body);
    }
    const response = await test;
    seen.push(response);
    try {
      assertSafeResponse(response);
    } catch (error) {
      throw new Error(`Response from ${upperMethod} ${path} was unsafe.`, { cause: error });
    }
    return response;
  }

  async function login(credentials = INVARIANT_ADMIN): Promise<{
    cookie: string;
    response: Response;
  }> {
    const response = await send('POST', '/api/v1/auth/login', { body: credentials });
    if (response.status !== 200) {
      throw new Error(`Invariant login failed with status ${response.status}.`);
    }
    const setCookie = response.headers['set-cookie']?.[0];
    if (!setCookie) {
      throw new Error('Invariant login succeeded without setting a session cookie.');
    }
    return { cookie: setCookie.split(';', 1)[0]!, response };
  }

  return {
    app,
    prisma,
    origin,
    admin: { ...admin, password: INVARIANT_ADMIN.password },
    routes,
    send,
    login,
    seen,
    async close() {
      await app.close();
      await permissionGrant?.revoke();
      await setupClient.$disconnect();
      await setupPool.end();
    },
  };
}

export function assertSafeResponse(response: Response): void {
  assertSafeResponseBody(response.status, response.body);
}

export function assertSafeResponseBody(status: number, body: unknown): void {
  assertNoSecrets(body);
  if (status < 400) {
    return;
  }
  if (
    !isRecord(body) ||
    typeof body.statusCode !== 'number' ||
    typeof body.code !== 'string' ||
    typeof body.message !== 'string' ||
    typeof body.requestId !== 'string'
  ) {
    throw new Error(`HTTP ${status} response does not have the uniform error envelope.`);
  }
}

export function assertNoSecrets(value: unknown, path = 'body'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === 'passwordhash' || key.toLowerCase() === 'stack') {
      throw new Error(`Sensitive/internal field "${key}" found at ${path}.${key}.`);
    }
    assertNoSecrets(child, `${path}.${key}`);
  }
}

export function assertEveryResponseSafe(api: InvariantApi): void {
  for (const response of api.seen) {
    assertSafeResponse(response);
  }
}

export function assertStatus(response: Response, status: number, code?: string): void {
  if (response.status !== status) {
    throw new Error(
      `Expected HTTP ${status}; got ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  if (code !== undefined && response.body.code !== code) {
    throw new Error(`Expected error code ${code}; got ${response.body.code}.`);
  }
}

function enumerateRoutes(app: INestApplication): ApiRoute[] {
  const instance = app.getHttpAdapter().getInstance() as unknown;
  const router = isRecord(instance) && 'router' in instance ? instance.router : undefined;
  const stack = isRecord(router) && Array.isArray(router.stack) ? router.stack : undefined;
  if (!stack) {
    throw new Error('Unable to enumerate routes from the running HTTP router.');
  }
  const routes: ApiRoute[] = [];
  for (const layer of stack) {
    if (!isRecord(layer) || !isRecord(layer.route)) {
      continue;
    }
    const routePath = layer.route.path;
    const methods = layer.route.methods;
    if (typeof routePath !== 'string' || !isRecord(methods)) {
      continue;
    }
    for (const [method, enabled] of Object.entries(methods)) {
      if (enabled && method !== 'head' && method !== 'options') {
        routes.push({ method: method.toUpperCase(), path: routePath });
      }
    }
  }
  if (routes.length === 0) {
    throw new Error('The running HTTP router exposed no routes.');
  }
  return routes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
