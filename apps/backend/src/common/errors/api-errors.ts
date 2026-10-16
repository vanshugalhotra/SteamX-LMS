/**
 * Shared API error codes and messages used by services, guards, and filters.
 */
export const API_ERROR = {
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
  EMPTY_UPDATE: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: [{ field: 'body', errors: ['At least one field must be provided'] }],
  },
  NOT_FOUND: { code: 'NOT_FOUND', message: 'Resource not found' },
  AUTHENTICATION_FAILED: {
    code: 'UNAUTHORIZED',
    message: 'Invalid or expired authentication token',
  },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'Forbidden' },
  PERMISSION_REQUIRED: {
    code: 'FORBIDDEN',
    message: 'Your account does not have the permission required for this action.',
  },
  PASSWORD_CHANGE_REQUIRED: {
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'Password change required',
  },
  ORIGIN_NOT_ALLOWED: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' },
  CONFLICT: { code: 'CONFLICT', message: 'Resource already exists' },
  RELATED_DATA_CONFLICT: {
    code: 'CONFLICT',
    message: 'Operation conflicts with related data',
  },
  SCHOOL_REQUIRED: { code: 'SCHOOL_REQUIRED', message: 'A school is required' },
  SCHOOL_INACTIVE: { code: 'SCHOOL_INACTIVE', message: 'School is inactive' },
  SCHOOL_CODE_EXISTS: { code: 'SCHOOL_CODE_EXISTS', message: 'School code already exists' },
  SCHOOL_FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'Only platform staff can create schools.',
  },
  USER_NOT_FOUND: { code: 'NOT_FOUND', message: 'User not found' },
  CLASS_SECTION_EXISTS: {
    code: 'CLASS_SECTION_EXISTS',
    message: 'Class section already exists',
  },
  CLASS_SECTION_IN_USE: {
    code: 'CLASS_SECTION_IN_USE',
    message: 'Class section is in use',
  },
  ROLE_CONFIGURATION_ERROR: {
    code: 'ROLE_CONFIGURATION_ERROR',
    message: 'User role is not configured correctly',
  },
  PASSWORD_POLICY: {
    code: 'PASSWORD_POLICY',
    message: 'Password does not meet policy requirements',
  },
  INVALID_CURRENT_PASSWORD: {
    code: 'INVALID_CURRENT_PASSWORD',
    message: 'Current password is incorrect',
  },
  PASSWORD_REUSED: {
    code: 'PASSWORD_REUSED',
    message: 'New password must be different from the current password',
  },
  CANNOT_RESET_OWN_PASSWORD: {
    code: 'CANNOT_RESET_OWN_PASSWORD',
    message: 'Use change-password to update your own password',
  },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  HTTP_ERROR: { code: 'HTTP_ERROR', message: 'Request failed' },
} as const;

export const HTTP_ERROR_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

export function permissionRequiredError(permission: string) {
  return {
    ...API_ERROR.PERMISSION_REQUIRED,
    message: `Your account does not have the required permission '${permission}'. Ask an administrator to grant it to your role.`,
  };
}
