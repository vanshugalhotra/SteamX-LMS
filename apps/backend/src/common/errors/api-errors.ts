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
  STEAMX_ID_UNAVAILABLE: {
    code: 'STEAMX_ID_UNAVAILABLE',
    message: "Couldn't allocate a SteamX ID. Please try again.",
  },
  SCHOOL_FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'Only platform staff can create schools.',
  },
  STEAMX_ID_NOT_RENAMABLE: {
    code: 'STEAMX_ID_NOT_RENAMABLE',
    message: 'Platform staff SteamX IDs cannot be renamed.',
  },
  INVALID_STEAMX_ID: {
    code: 'INVALID_STEAMX_ID',
    message: 'SteamX ID does not match the target school format.',
  },
  STEAMX_ID_TAKEN: {
    code: 'STEAMX_ID_TAKEN',
    message: 'SteamX ID is already in use.',
  },
  CLASS_SECTION_EXISTS: {
    code: 'CLASS_SECTION_EXISTS',
    message: 'Class section already exists',
  },
  RESOURCE_IN_USE: {
    code: 'RESOURCE_IN_USE',
    message: 'Resource has dependent records and cannot be deleted',
  },
  INVALID_ORDER: {
    code: 'INVALID_ORDER',
    message: 'The supplied IDs must include every item in the parent exactly once',
  },
  PARENT_NOT_ACTIVE: {
    code: 'PARENT_NOT_ACTIVE',
    message: 'The parent course must be active',
  },
  INVALID_STATUS_TRANSITION: {
    code: 'INVALID_STATUS_TRANSITION',
    message: 'The requested content status transition is not allowed',
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
  USER_NOT_MANAGEABLE: {
    code: 'USER_NOT_MANAGEABLE',
    message: 'Platform staff accounts cannot be managed here.',
  },
  FIELD_NOT_APPLICABLE: {
    code: 'FIELD_NOT_APPLICABLE',
    message: 'A supplied field does not apply to this user type.',
  },
  CANNOT_DEACTIVATE_SELF: {
    code: 'CANNOT_DEACTIVATE_SELF',
    message: 'You cannot change your own status.',
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
