import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { AUTHENTICATED_ROUTE, PUBLIC_ROUTE } from '../decorators/metadata.constants.js';
import { REQUIRED_PERMISSION } from '../decorators/require-permission.decorator.js';
import { PERMISSION } from '../permissions.js';
import { PermissionsService } from '../services/permissions.service.js';
import { PermissionGuard } from './permission.guard.js';

describe('PermissionGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies protected routes without explicit authorization metadata', async () => {
    const { guard, context, moduleRef } = await createGuard({});

    expect(() => guard.canActivate(context)).toThrow(new ForbiddenException(API_ERROR.FORBIDDEN));
    await moduleRef.close();
  });

  it('allows a route explicitly marked as authenticated-only', async () => {
    const { guard, context, moduleRef } = await createGuard(
      { [AUTHENTICATED_ROUTE]: true },
      { authContext: { userId: 'user-id', roleKey: 'teacher' } },
    );

    expect(guard.canActivate(context)).toBe(true);
    await moduleRef.close();
  });

  it('denies authenticated-only routes without an authenticated user', async () => {
    const { guard, context, moduleRef } = await createGuard({
      [AUTHENTICATED_ROUTE]: true,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    await moduleRef.close();
  });

  it('allows a public route without an authenticated user', async () => {
    const { guard, context, moduleRef } = await createGuard({ [PUBLIC_ROUTE]: true });

    expect(guard.canActivate(context)).toBe(true);
    await moduleRef.close();
  });

  it('requires a matching permission for permission-protected routes', async () => {
    const permissions = { has: vi.fn().mockReturnValue(false) };
    const { guard, context, moduleRef } = await createGuard(
      { [REQUIRED_PERMISSION]: PERMISSION.USER_READ },
      { authContext: { userId: 'user-id', roleKey: 'teacher' } },
      permissions,
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    await moduleRef.close();
  });

  // A route marked with a permission is available when the current role grants it.
  it('allows an authenticated user with the required permission', async () => {
    const permissions = { has: vi.fn().mockReturnValue(true) };
    const { guard, context, moduleRef } = await createGuard(
      { [REQUIRED_PERMISSION]: PERMISSION.USER_READ },
      { authContext: { userId: 'user-id', roleKey: 'school_admin' } },
      permissions,
    );

    expect(guard.canActivate(context)).toBe(true);
    await moduleRef.close();
  });

  it('does not let an authenticated-only marker bypass a required permission', async () => {
    const permissions = { has: vi.fn().mockReturnValue(false) };
    const { guard, context, moduleRef } = await createGuard(
      {
        [AUTHENTICATED_ROUTE]: true,
        [REQUIRED_PERMISSION]: PERMISSION.USER_READ,
      },
      { authContext: { userId: 'user-id', roleKey: 'teacher' } },
      permissions,
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    await moduleRef.close();
  });
});

async function createGuard(
  metadata: Record<string, unknown>,
  request: Record<string, unknown> = {},
  permissions = { has: vi.fn().mockReturnValue(true) },
): Promise<{ guard: PermissionGuard; context: ExecutionContext; moduleRef: TestingModule }> {
  const handler = vi.fn();
  class TestController {}
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      PermissionGuard,
      { provide: Reflector, useValue: new Reflector() },
      { provide: PermissionsService, useValue: permissions },
    ],
  }).compile();

  return {
    guard: moduleRef.get(PermissionGuard),
    context: new ExecutionContextHost([request, undefined, undefined], TestController, handler),
    moduleRef,
  };
}
