import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertStatus, startInvariantApi, type InvariantApi } from '../support/invariant-api.js';

describe('First admin login workflow', () => {
  let api: InvariantApi;
  beforeAll(async () => {
    api = await startInvariantApi({ adminMustChangePassword: true });
  });
  afterAll(async () => api?.close());

  it('requires the first admin to change password before normal access and replaces the session', async () => {
    const login = await api.login();
    expect(login.response.body.mustChangePassword).toBe(true);
    expect(login.response.body).not.toHaveProperty('passwordHash');
    assertStatus(await api.send('GET', '/api/v1/auth/me', { cookie: login.cookie }), 200);
    assertStatus(
      await api.send('GET', '/api/v1/schools', { cookie: login.cookie }),
      403,
      'PASSWORD_CHANGE_REQUIRED',
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2_000);
    const changed = await api.send('POST', '/api/v1/auth/change-password', {
      cookie: login.cookie,
      body: {
        currentPassword: api.admin.password,
        newPassword: 'First admin updated password 2026!',
      },
    });
    assertStatus(changed, 200);
    expect(changed.body.mustChangePassword).toBe(false);
    expect(changed.body).not.toHaveProperty('passwordHash');

    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: login.cookie }),
      401,
      'AUTHENTICATION_FAILED',
    );
    const newCookie = cookieFrom(changed);
    assertStatus(await api.send('GET', '/api/v1/schools', { cookie: newCookie }), 200);
    assertStatus(
      await api.send('POST', '/api/v1/auth/logout', {
        cookie: newCookie,
        body: {},
      }),
      204,
    );
    const newLogin = await api.send('POST', '/api/v1/auth/login', {
      body: {
        steamxId: api.admin.steamxId,
        password: 'First admin updated password 2026!',
      },
    });
    assertStatus(newLogin, 200);
    const oldPassword = await api.send('POST', '/api/v1/auth/login', {
      body: { steamxId: api.admin.steamxId, password: api.admin.password },
    });
    assertStatus(oldPassword, 401, 'AUTHENTICATION_FAILED');
  });
});

function cookieFrom(response: { headers: Record<string, string | string[] | undefined> }): string {
  const cookie = response.headers['set-cookie'];
  const first = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!first) {
    throw new Error('Password change did not refresh the admin session cookie.');
  }
  return first.split(';', 1)[0]!;
}
