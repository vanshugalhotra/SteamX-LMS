/** Shared API error codes and messages used by services, guards, and filters. */
type ErrorDefinition = string | { code?: string; message: string; details?: unknown };

type ErrorCode<Definition, Key extends string> = Definition extends {
  code: infer Code extends string;
}
  ? Code
  : Key;
type DefinedErrors<T extends Record<string, ErrorDefinition>> = {
  [Key in keyof T]: { code: ErrorCode<T[Key], Key & string>; message: string; details?: unknown };
};

function defineErrors<const T extends Record<string, ErrorDefinition>>(definitions: T) {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => [
      key,
      typeof definition === 'string'
        ? { code: key, message: definition }
        : { ...definition, code: definition.code ?? key },
    ]),
  ) as DefinedErrors<T>;
}

const notFound = (resource: string, context?: string) =>
  `${resource} not found${context ? ` in ${context}` : ''}`;
const notActive = (resource: string, context?: string) =>
  `${resource} is not active${context ? ` in ${context}` : ''}`;
const alreadyExists = (resource: string, context?: string) =>
  `${resource} already exists${context ? ` for ${context}` : ''}`;

export const API_ERROR = {
  ...defineErrors({
    // General
    VALIDATION_ERROR: 'Validation failed',
    EMPTY_UPDATE: {
      message: 'Validation failed',
      details: [{ field: 'body', errors: ['At least one field must be provided'] }],
    },
    NOT_FOUND: 'Resource not found',
    FORBIDDEN: 'Forbidden',
    CONFLICT: 'Resource already exists',
    RELATED_DATA_CONFLICT: 'Operation conflicts with related data',
    RESOURCE_IN_USE: 'Resource has dependent records and cannot be deleted',
    INTERNAL_ERROR: 'Internal server error',
    HTTP_ERROR: 'Request failed',
  }),

  ...defineErrors({
    // Auth
    AUTHENTICATION_FAILED: 'Invalid or expired authentication token',
    PERMISSION_REQUIRED: 'Your account does not have the permission required for this action.',
    PASSWORD_CHANGE_REQUIRED: 'Password change required',
    ORIGIN_NOT_ALLOWED: 'Origin not allowed',
    ROLE_CONFIGURATION_ERROR: 'User role is not configured correctly',
    PASSWORD_POLICY: 'Password does not meet policy requirements',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect',
    PASSWORD_REUSED: 'New password must be different from the current password',
    CANNOT_RESET_OWN_PASSWORD: 'Use change-password to update your own password',
  }),

  ...defineErrors({
    // Schools
    SCHOOL_REQUIRED: 'A school is required',
    SCHOOL_INACTIVE: notActive('School'),
    SCHOOL_CODE_EXISTS: alreadyExists('School code'),
    SCHOOL_FORBIDDEN: 'Only platform staff can create schools.',
  }),

  ...defineErrors({
    // Users
    STEAMX_ID_UNAVAILABLE: "Couldn't allocate a SteamX ID. Please try again.",
    STEAMX_ID_NOT_RENAMABLE: 'Platform staff SteamX IDs cannot be renamed.',
    INVALID_STEAMX_ID: 'SteamX ID does not match the target school format.',
    STEAMX_ID_TAKEN: alreadyExists('SteamX ID'),
    USER_NOT_MANAGEABLE: 'Platform staff accounts cannot be managed here.',
    FIELD_NOT_APPLICABLE: 'A supplied field does not apply to this user type.',
    CANNOT_DEACTIVATE_SELF: 'You cannot change your own status.',
  }),

  ...defineErrors({
    // Class sections
    CLASS_SECTION_EXISTS: alreadyExists('Class section'),
  }),

  ...defineErrors({
    // Assets
    ASSET_NOT_READY: 'Asset does not have a READY file',
    ASSET_TYPE_NOT_SUPPORTED: 'Asset type is not supported.',
    REPLACEMENT_IN_PROGRESS: 'An asset file is already being processed.',
  }),

  ...defineErrors({
    // Subscriptions
    SUBSCRIPTION_NOT_FOUND: notFound('Subscription'),
    SUBSCRIPTION_EXPIRED: notActive('Subscription'),
    COURSE_NOT_ACTIVE: notActive('Course'),
    DELIVERY_CAP_BELOW_ACTIVE:
      'Maximum deliveries cannot be below the current active delivery count',
    SUBSCRIPTION_ALREADY_ENDED: 'Subscription has already ended',
    SUBSCRIPTION_OVERLAP:
      'Subscription dates overlap an existing subscription for this school and course',
    SUBSCRIPTION_INVALID_DATE_RANGE: 'End date must be on or after start date',
  }),

  ...defineErrors({
    // Deliveries
    DELIVERY_ALREADY_EXISTS: alreadyExists('Delivery', 'this class, course, and academic year'),
    DELIVERY_LIMIT_REACHED: 'The active delivery limit has been reached',
    DELIVERY_NOT_ACTIVE: notActive('Delivery'),
  }),

  ...defineErrors({
    // Deliveries: enrollment
    STUDENT_NOT_FOUND: notFound('Student', 'the delivery school'),
    STUDENT_NOT_ACTIVE: notActive('Student'),
    STUDENT_WRONG_CLASS: 'Students must belong to the delivery class section',
    ENROLLMENT_NOT_FOUND: notFound('Enrollment'),
    ENROLLMENT_NOT_ACTIVE: 'Completed enrollments cannot be removed',
  }),

  ...defineErrors({
    // Deliveries: teachers
    TEACHER_NOT_ACTIVE: notActive('Teacher'),
    TEACHER_ALREADY_ASSIGNED: alreadyExists('Teacher assignment', 'this delivery'),
    TEACHER_NOT_ASSIGNED: 'The teacher has no active assignment to this delivery',
  }),

  ...defineErrors({
    // Deliveries: release
    LESSON_NOT_FOUND: notFound('Lesson', 'the delivery course'),
    MODULE_NOT_FOUND: notFound('Module', 'the delivery course'),
    LESSON_NOT_RELEASABLE: 'Lesson is not eligible for release',
    MODULE_NOT_ACTIVE: notActive('Module'),
  }),

  ...defineErrors({
    // Curriculum
    INVALID_ORDER: 'The supplied IDs must include every item in the parent exactly once',
    PARENT_NOT_ACTIVE: notActive('Parent course'),
    INVALID_STATUS_TRANSITION: 'The requested content status transition is not allowed',
    INVALID_LESSON_CONTENT: 'Lesson content is invalid',
    VERSION_CONFLICT: 'Lesson content has changed since it was read',
  }),
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
