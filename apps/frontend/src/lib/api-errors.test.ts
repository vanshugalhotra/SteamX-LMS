import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODE,
  getErrorMessage,
  getErrorMessages,
  getFieldErrors,
  hasErrorCode,
} from './api-errors';
import { ApiError } from './api-client';

const apiError = (status: number, code?: string, details?: unknown) =>
  new ApiError(status, 'debug message', { code, details });

describe('hasErrorCode', () => {
  it('matches only ApiError with the same code', () => {
    expect(hasErrorCode(apiError(403, 'FORBIDDEN'), API_ERROR_CODE.FORBIDDEN)).toBe(true);
    expect(hasErrorCode(apiError(403, 'FORBIDDEN'), API_ERROR_CODE.NOT_FOUND)).toBe(false);
    expect(hasErrorCode(new Error('x'), API_ERROR_CODE.FORBIDDEN)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns a generic message for non-ApiError values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(null)).toBe('Something went wrong. Please try again.');
  });

  it('returns the network message when status is 0', () => {
    expect(getErrorMessage(new ApiError(0, 'Network error'))).toBe(
      'Network error. Please check your connection.',
    );
  });

  it('maps a known code to its default message', () => {
    expect(getErrorMessage(apiError(409, 'SCHOOL_CODE_EXISTS'))).toBe(
      'This school code is already in use.',
    );
  });

  it('prefers a feature-specific override for the code', () => {
    const error = apiError(401, 'UNAUTHORIZED');
    expect(getErrorMessage(error, { UNAUTHORIZED: 'Wrong SteamX ID or password.' })).toBe(
      'Wrong SteamX ID or password.',
    );
  });

  it('ignores overrides for other codes', () => {
    const error = apiError(401, 'UNAUTHORIZED');
    expect(getErrorMessage(error, { FORBIDDEN: 'nope' })).toBe(
      'Your session has expired. Please log in again.',
    );
  });

  it('falls back to the HTTP status when the code is unknown', () => {
    expect(getErrorMessage(apiError(404, 'SOMETHING_NEW'))).toBe(
      "We couldn't find what you were looking for.",
    );
    expect(getErrorMessage(apiError(429))).toBe(
      'Too many attempts. Please wait a minute and try again.',
    );
  });

  it('falls back to the generic message for unknown code and status', () => {
    expect(getErrorMessage(apiError(418, 'TEAPOT'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('does not treat Object prototype keys as known codes', () => {
    expect(getErrorMessage(apiError(500, 'toString'))).toBe(
      'Something went wrong on our side. Please try again.',
    );
  });
});

describe('getErrorMessages', () => {
  it('wraps a normal error in a one-item array', () => {
    expect(getErrorMessages(apiError(404, 'NOT_FOUND'))).toEqual([
      "We couldn't find what you were looking for.",
    ]);
  });

  it('expands PASSWORD_POLICY into one message per violated rule', () => {
    const error = apiError(400, 'PASSWORD_POLICY', ['PASSWORD_LENGTH', 'PASSWORD_COMMON']);
    expect(getErrorMessages(error)).toEqual([
      'Password must be between 8 and 100 characters.',
      'Password is too common.',
    ]);
  });

  it('uses the fallback for unknown rules and removes duplicates', () => {
    const error = apiError(400, 'PASSWORD_POLICY', ['NEW_RULE', 'OTHER_RULE']);
    expect(getErrorMessages(error)).toEqual(['Password does not meet the policy.']);
  });

  it('uses the fallback when details are missing or not an array', () => {
    expect(getErrorMessages(apiError(400, 'PASSWORD_POLICY'))).toEqual([
      'Password does not meet the policy.',
    ]);
    expect(getErrorMessages(apiError(400, 'PASSWORD_POLICY', []))).toEqual([
      'Password does not meet the policy.',
    ]);
  });

  it('ignores non-string details', () => {
    const error = apiError(400, 'PASSWORD_POLICY', [42, 'PASSWORD_WHITESPACE', null]);
    expect(getErrorMessages(error)).toEqual(['Password must not start or end with spaces.']);
  });

  it('applies the PASSWORD_POLICY override as the fallback', () => {
    const error = apiError(400, 'PASSWORD_POLICY', []);
    expect(getErrorMessages(error, { PASSWORD_POLICY: 'Pick a stronger password.' })).toEqual([
      'Pick a stronger password.',
    ]);
  });
});

describe('getFieldErrors', () => {
  it('returns the first message per field for VALIDATION_ERROR', () => {
    const error = apiError(400, 'VALIDATION_ERROR', [
      { field: 'name', errors: ['name should not be empty', 'name must be a string'] },
      { field: 'email', errors: ['email must be an email'] },
    ]);
    expect(getFieldErrors(error)).toEqual({
      name: 'name should not be empty',
      email: 'email must be an email',
    });
  });

  it('returns {} for other error codes and non-ApiError values', () => {
    expect(getFieldErrors(apiError(400, 'BAD_REQUEST', [{ field: 'a', errors: ['x'] }]))).toEqual(
      {},
    );
    expect(getFieldErrors(new Error('x'))).toEqual({});
  });

  it('returns {} when details is not an array', () => {
    expect(getFieldErrors(apiError(400, 'VALIDATION_ERROR', 'oops'))).toEqual({});
    expect(getFieldErrors(apiError(400, 'VALIDATION_ERROR'))).toEqual({});
  });

  it('skips malformed entries', () => {
    const error = apiError(400, 'VALIDATION_ERROR', [
      null,
      'text',
      { field: 1, errors: ['x'] },
      { field: 'a', errors: 'x' },
      { field: 'b', errors: [] },
      { field: 'c', errors: [7] },
      { field: 'ok', errors: ['fine'] },
    ]);
    expect(getFieldErrors(error)).toEqual({ ok: 'fine' });
  });
});
