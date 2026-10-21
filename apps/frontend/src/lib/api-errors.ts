import { ApiError } from './api-client';

// Mirrors apps/backend/src/common/errors/api-errors.ts (API_ERROR and HTTP_ERROR_CODES).
// TODO: share these codes with the backend (shared package or OpenAPI) so they cannot drift.
export const API_ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  SCHOOL_REQUIRED: 'SCHOOL_REQUIRED',
  SCHOOL_INACTIVE: 'SCHOOL_INACTIVE',
  SCHOOL_CODE_EXISTS: 'SCHOOL_CODE_EXISTS',
  STEAMX_ID_UNAVAILABLE: 'STEAMX_ID_UNAVAILABLE',
  STEAMX_ID_NOT_RENAMABLE: 'STEAMX_ID_NOT_RENAMABLE',
  INVALID_STEAMX_ID: 'INVALID_STEAMX_ID',
  STEAMX_ID_TAKEN: 'STEAMX_ID_TAKEN',
  CLASS_SECTION_EXISTS: 'CLASS_SECTION_EXISTS',
  CLASS_SECTION_IN_USE: 'CLASS_SECTION_IN_USE',
  ROLE_CONFIGURATION_ERROR: 'ROLE_CONFIGURATION_ERROR',
  PASSWORD_POLICY: 'PASSWORD_POLICY',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  PASSWORD_REUSED: 'PASSWORD_REUSED',
  CANNOT_RESET_OWN_PASSWORD: 'CANNOT_RESET_OWN_PASSWORD',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

/** Default user-facing message per code. Adding a code above forces a message here. */
const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  NOT_FOUND: "We couldn't find what you were looking for.",
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: "You don't have access to this.",
  PASSWORD_CHANGE_REQUIRED: 'You need to change your password before continuing.',
  ORIGIN_NOT_ALLOWED: 'This app is not allowed to talk to the server. Please contact support.',
  CONFLICT: 'This already exists.',
  SCHOOL_REQUIRED: 'Please select a school.',
  SCHOOL_INACTIVE: 'This school is inactive.',
  SCHOOL_CODE_EXISTS: 'This school code is already in use.',
  STEAMX_ID_UNAVAILABLE: "We couldn't generate a SteamX ID. Please try again.",
  STEAMX_ID_NOT_RENAMABLE: 'Platform staff SteamX IDs cannot be renamed.',
  INVALID_STEAMX_ID: 'This SteamX ID does not match the school format.',
  STEAMX_ID_TAKEN: 'This SteamX ID is already in use.',
  CLASS_SECTION_EXISTS: 'This class section already exists.',
  CLASS_SECTION_IN_USE: 'This class section is in use and cannot be changed.',
  ROLE_CONFIGURATION_ERROR: 'This account is not set up correctly. Please contact support.',
  PASSWORD_POLICY: 'Password does not meet the policy.',
  INVALID_CURRENT_PASSWORD: 'Your current password is incorrect.',
  PASSWORD_REUSED: 'Your new password must be different from your current password.',
  CANNOT_RESET_OWN_PASSWORD: 'Use change password to update your own password.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  HTTP_ERROR: 'Something went wrong. Please try again.',
  BAD_REQUEST: 'The request was not valid. Please check your input.',
  PAYLOAD_TOO_LARGE: 'The data you sent is too large.',
  TOO_MANY_REQUESTS: 'Too many attempts. Please wait a minute and try again.',
};

// Mirrors PASSWORD_POLICY_VIOLATION in apps/backend/src/auth/validators/password-policy.ts.
const PASSWORD_POLICY_MESSAGES: Record<string, string> = {
  PASSWORD_LENGTH: 'Password must be between 8 and 100 characters.',
  PASSWORD_WHITESPACE: 'Password must not start or end with spaces.',
  PASSWORD_COMMON: 'Password is too common.',
  PASSWORD_CONTAINS_STEAMX_ID: 'Password must not contain your SteamX ID.',
};

/** Used when the code is missing or unknown. */
const STATUS_MESSAGES: Partial<Record<number, string>> = {
  400: DEFAULT_MESSAGES.BAD_REQUEST,
  401: DEFAULT_MESSAGES.UNAUTHORIZED,
  403: DEFAULT_MESSAGES.FORBIDDEN,
  404: DEFAULT_MESSAGES.NOT_FOUND,
  409: DEFAULT_MESSAGES.CONFLICT,
  413: DEFAULT_MESSAGES.PAYLOAD_TOO_LARGE,
  429: DEFAULT_MESSAGES.TOO_MANY_REQUESTS,
  500: DEFAULT_MESSAGES.INTERNAL_ERROR,
};

const NETWORK_MESSAGE = 'Network error. Please check your connection.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** Per-feature wording for specific codes, e.g. UNAUTHORIZED on the login form. */
export type ErrorOverrides = Partial<Record<ApiErrorCode, string>>;

function isKnownCode(code: string | undefined): code is ApiErrorCode {
  return code !== undefined && Object.hasOwn(DEFAULT_MESSAGES, code);
}

export function hasErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof ApiError && error.code === code;
}

/** One readable message for any error. Never returns a raw code. */
export function getErrorMessage(error: unknown, overrides: ErrorOverrides = {}): string {
  if (!(error instanceof ApiError)) return GENERIC_MESSAGE;
  if (error.status === 0) return NETWORK_MESSAGE;
  if (isKnownCode(error.code)) return overrides[error.code] ?? DEFAULT_MESSAGES[error.code];
  return STATUS_MESSAGES[error.status] ?? GENERIC_MESSAGE;
}

/** Like getErrorMessage, but PASSWORD_POLICY expands to one message per violated rule. */
export function getErrorMessages(error: unknown, overrides: ErrorOverrides = {}): string[] {
  if (hasErrorCode(error, API_ERROR_CODE.PASSWORD_POLICY) && error instanceof ApiError) {
    const details: unknown = error.details;
    const codes = Array.isArray(details)
      ? (details as unknown[]).filter((d): d is string => typeof d === 'string')
      : [];
    const fallback = overrides.PASSWORD_POLICY ?? DEFAULT_MESSAGES.PASSWORD_POLICY;
    if (codes.length === 0) return [fallback];
    return [...new Set(codes.map((code) => PASSWORD_POLICY_MESSAGES[code] ?? fallback))];
  }
  return [getErrorMessage(error, overrides)];
}

/** VALIDATION_ERROR `details` ([{ field, errors[] }]) as field -> first message. */
export function getFieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!hasErrorCode(error, API_ERROR_CODE.VALIDATION_ERROR) || !(error instanceof ApiError)) {
    return result;
  }
  const details: unknown = error.details;
  if (!Array.isArray(details)) return result;

  for (const entry of details as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { field, errors } = entry as { field?: unknown; errors?: unknown };
    if (typeof field !== 'string' || !Array.isArray(errors)) continue;
    const first: unknown = errors[0];
    if (typeof first === 'string') result[field] = first;
  }
  return result;
}

// TODO: Add tests once the frontend testing setup is in place.
// Cover:
// - Error-code and HTTP-status fallbacks, including unknown codes.
// - Password-policy violation details and fallback messages.
// - VALIDATION_ERROR field-error extraction.
// - Feature-specific message overrides.
