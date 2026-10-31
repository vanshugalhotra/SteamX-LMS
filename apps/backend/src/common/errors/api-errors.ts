/**
 * Shared API error codes and messages used by services, guards, and filters.
 *
 * Grouped by domain area so related errors stay together as the file grows.
 */
export const API_ERROR = {
  // ── General ────────────────────────────────────────────
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
  EMPTY_UPDATE: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: [{ field: 'body', errors: ['At least one field must be provided'] }],
  },
  NOT_FOUND: { code: 'NOT_FOUND', message: 'Resource not found' },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'Forbidden' },
  CONFLICT: { code: 'CONFLICT', message: 'Resource already exists' },
  RELATED_DATA_CONFLICT: {
    code: 'CONFLICT',
    message: 'Operation conflicts with related data',
  },
  ASSET_NOT_READY: {
    code: 'ASSET_NOT_READY',
    message: 'Asset does not have a READY file',
  },
  REPLACEMENT_IN_PROGRESS: {
    code: 'REPLACEMENT_IN_PROGRESS',
    message: 'An asset file is already being processed.',
  },
  RESOURCE_IN_USE: {
    code: 'RESOURCE_IN_USE',
    message: 'Resource has dependent records and cannot be deleted',
  },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  HTTP_ERROR: { code: 'HTTP_ERROR', message: 'Request failed' },

  // ── Auth & Permissions ─────────────────────────────────
  AUTHENTICATION_FAILED: {
    code: 'UNAUTHORIZED',
    message: 'Invalid or expired authentication token',
  },
  PERMISSION_REQUIRED: {
    code: 'FORBIDDEN',
    message: 'Your account does not have the permission required for this action.',
  },
  PASSWORD_CHANGE_REQUIRED: {
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'Password change required',
  },
  ORIGIN_NOT_ALLOWED: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' },
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

  // ── Schools ────────────────────────────────────────────
  SCHOOL_REQUIRED: { code: 'SCHOOL_REQUIRED', message: 'A school is required' },
  SCHOOL_INACTIVE: { code: 'SCHOOL_INACTIVE', message: 'School is inactive' },
  SCHOOL_CODE_EXISTS: { code: 'SCHOOL_CODE_EXISTS', message: 'School code already exists' },
  SCHOOL_FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'Only platform staff can create schools.',
  },

  // ── Users & SteamX IDs ─────────────────────────────────
  STEAMX_ID_UNAVAILABLE: {
    code: 'STEAMX_ID_UNAVAILABLE',
    message: "Couldn't allocate a SteamX ID. Please try again.",
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

  // ── Class Sections ─────────────────────────────────────
  CLASS_SECTION_EXISTS: {
    code: 'CLASS_SECTION_EXISTS',
    message: 'Class section already exists',
  },

  // ── Subscriptions ─────────────────────────────────────
  SUBSCRIPTION_NOT_FOUND: {
    code: 'SUBSCRIPTION_NOT_FOUND',
    message: 'Subscription not found',
  },
  SUBSCRIPTION_EXPIRED: {
    code: 'SUBSCRIPTION_EXPIRED',
    message: "This school's subscription for this course is not active",
  },
  COURSE_NOT_ACTIVE: {
    code: 'COURSE_NOT_ACTIVE',
    message: 'Subscriptions can only be granted for an active course',
  },
  DELIVERY_CAP_BELOW_ACTIVE: {
    code: 'DELIVERY_CAP_BELOW_ACTIVE',
    message: 'Maximum deliveries cannot be below the current active delivery count',
  },
  SUBSCRIPTION_ALREADY_ENDED: {
    code: 'SUBSCRIPTION_ALREADY_ENDED',
    message: 'Subscription has already ended',
  },
  SUBSCRIPTION_OVERLAP: {
    code: 'SUBSCRIPTION_OVERLAP',
    message: 'Subscription dates overlap an existing subscription for this school and course',
  },
  SUBSCRIPTION_INVALID_DATE_RANGE: {
    code: 'SUBSCRIPTION_INVALID_DATE_RANGE',
    message: 'End date must be on or after start date',
  },
  DELIVERY_ALREADY_EXISTS: {
    code: 'DELIVERY_ALREADY_EXISTS',
    message: 'A delivery already exists for this class, course, and academic year',
  },
  DELIVERY_LIMIT_REACHED: {
    code: 'DELIVERY_LIMIT_REACHED',
    message: 'The active delivery limit has been reached',
  },
  DELIVERY_NOT_ACTIVE: {
    code: 'DELIVERY_NOT_ACTIVE',
    message: 'The delivery must be active for this operation',
  },
  LESSON_NOT_FOUND: {
    code: 'LESSON_NOT_FOUND',
    message: 'Lesson not found in the delivery course',
  },
  MODULE_NOT_FOUND: {
    code: 'MODULE_NOT_FOUND',
    message: 'Module not found in the delivery course',
  },
  LESSON_NOT_RELEASABLE: {
    code: 'LESSON_NOT_RELEASABLE',
    message: 'Lesson is not eligible for release',
  },
  MODULE_NOT_ACTIVE: {
    code: 'MODULE_NOT_ACTIVE',
    message: 'The module must be active for this operation',
  },
  STUDENT_NOT_FOUND: {
    code: 'STUDENT_NOT_FOUND',
    message: 'One or more students were not found in the delivery school',
  },
  STUDENT_NOT_ACTIVE: {
    code: 'STUDENT_NOT_ACTIVE',
    message: 'Only active students can be enrolled',
  },
  STUDENT_WRONG_CLASS: {
    code: 'STUDENT_WRONG_CLASS',
    message: 'Students must belong to the delivery class section',
  },
  ENROLLMENT_NOT_FOUND: {
    code: 'ENROLLMENT_NOT_FOUND',
    message: 'Enrollment not found',
  },
  ENROLLMENT_NOT_ACTIVE: {
    code: 'ENROLLMENT_NOT_ACTIVE',
    message: 'Completed enrollments cannot be removed',
  },
  TEACHER_NOT_ACTIVE: {
    code: 'TEACHER_NOT_ACTIVE',
    message: 'Only active teachers can be assigned to a delivery',
  },
  TEACHER_ALREADY_ASSIGNED: {
    code: 'TEACHER_ALREADY_ASSIGNED',
    message: 'The teacher already has an active assignment to this delivery',
  },
  TEACHER_NOT_ASSIGNED: {
    code: 'TEACHER_NOT_ASSIGNED',
    message: 'The teacher has no active assignment to this delivery',
  },

  // ── Curriculum ─────────────────────────────────────────
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
  INVALID_LESSON_CONTENT: {
    code: 'INVALID_LESSON_CONTENT',
    message: 'Lesson content is invalid',
  },
  VERSION_CONFLICT: {
    code: 'VERSION_CONFLICT',
    message: 'Lesson content has changed since it was read',
  },
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
