import { describe, expect, it } from 'vitest';
import { FirstAdminError } from './first-admin.service.js';
import { readFirstAdminInput } from './first-admin-input.js';

describe('readFirstAdminInput', () => {
  it('requires the bootstrap SteamX ID', () => {
    expect(() => readFirstAdminInput({ ADMIN_PASSWORD: 'not-logged' })).toThrow(
      new FirstAdminError('ADMIN_STEAMX_ID is required.'),
    );
  });

  it('requires the bootstrap password without including it in errors', () => {
    expect(() => readFirstAdminInput({ ADMIN_STEAMX_ID: 'ADM123', ADMIN_PASSWORD: '' })).toThrow(
      'ADMIN_PASSWORD is required.',
    );
  });

  it('does not include a supplied password in validation errors', () => {
    const password = 'never-print-this-bootstrap-password';
    let message = '';

    try {
      readFirstAdminInput({ ADMIN_PASSWORD: password });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('ADMIN_STEAMX_ID is required.');
    expect(message).not.toContain(password);
  });

  it('leaves the display name optional', () => {
    expect(
      readFirstAdminInput({
        ADMIN_STEAMX_ID: 'ADM123',
        ADMIN_PASSWORD: 'not-logged',
      }),
    ).toEqual({
      steamxId: 'ADM123',
      password: 'not-logged',
      name: undefined,
    });
  });
});
