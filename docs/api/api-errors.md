# API errors

The API error response contains `statusCode`, `code`, `message`, and `requestId`; `details` is
included when available for client errors. Branch on `code`, never on `message`. Messages are for
people and may change.

To add an error:

1. Add it under the right domain in `API_ERROR`; its code defaults to its key.
2. Use the resource helpers when the message is a not-found, not-active, or already-exists case.
3. Add the sorted code to the test and document its status and details below.

Use `RESOURCE_REASON` in uppercase, such as `LESSON_NOT_FOUND`. Codes are permanent once released.

## Catalog

Statuses below are the statuses thrown by backend call sites. `details` is omitted unless listed.
The `HTTP_ERROR_CODES` fallback codes are also included; `HTTP_ERROR` is used when a status has no
fallback mapping.

| Code                              | HTTP status | When it happens                                                     | Extra `details`                         |
| --------------------------------- | ----------: | ------------------------------------------------------------------- | --------------------------------------- |
| `ASSET_NOT_READY`                 |         409 | Asset has no ready file.                                            | None                                    |
| `ASSET_TYPE_NOT_SUPPORTED`        |         400 | Upload type is unsupported.                                         | None                                    |
| `AUTHENTICATION_FAILED`           |         401 | Credentials or authentication token are invalid.                    | None                                    |
| `BAD_REQUEST`                     |         400 | Framework bad request without a more specific code.                 | None                                    |
| `CANNOT_DEACTIVATE_SELF`          |         400 | A user tries to change their own status.                            | None                                    |
| `CANNOT_RESET_OWN_PASSWORD`       |         400 | A user tries to reset their own password through the admin flow.    | None                                    |
| `CLASS_SECTION_EXISTS`            |         409 | A class section conflicts with an existing section.                 | None                                    |
| `CONFLICT`                        |         409 | Generic conflict, including an unmapped unique constraint.          | None                                    |
| `COURSE_NOT_ACTIVE`               |         409 | A subscription operation requires an active course.                 | None                                    |
| `DELIVERY_ALREADY_EXISTS`         |         409 | A delivery already exists for the class, course, and academic year. | None                                    |
| `DELIVERY_CAP_BELOW_ACTIVE`       |         409 | A delivery cap would fall below active deliveries.                  | None                                    |
| `DELIVERY_LIMIT_REACHED`          |         409 | The active delivery limit has been reached.                         | None                                    |
| `DELIVERY_NOT_ACTIVE`             |         409 | An operation requires an active delivery.                           | None                                    |
| `EMPTY_UPDATE`                    |         400 | An update request contains no fields.                               | `{ field: "body", errors: string[] }[]` |
| `ENROLLMENT_NOT_ACTIVE`           |         409 | A completed enrollment is removed.                                  | None                                    |
| `ENROLLMENT_NOT_FOUND`            |         404 | An enrollment does not exist in scope.                              | None                                    |
| `FIELD_NOT_APPLICABLE`            |         400 | A supplied field does not apply to the user type.                   | None                                    |
| `FORBIDDEN`                       |         403 | Generic access denial.                                              | None                                    |
| `HTTP_ERROR`                      |      Varies | An HTTP status has no code in `HTTP_ERROR_CODES`.                   | None                                    |
| `INTERNAL_ERROR`                  |         500 | An unexpected server error occurs.                                  | None                                    |
| `INVALID_CURRENT_PASSWORD`        |         400 | The current password is incorrect.                                  | None                                    |
| `INVALID_LESSON_CONTENT`          |         400 | Lesson content fails validation.                                    | Validation issue array                  |
| `INVALID_ORDER`                   |         400 | The supplied order omits or repeats parent items.                   | None                                    |
| `INVALID_STATUS_TRANSITION`       |         409 | A content status transition is not allowed.                         | None                                    |
| `INVALID_STEAMX_ID`               |         400 | A SteamX ID does not match the school format.                       | None                                    |
| `LESSON_NOT_FOUND`                |         404 | A lesson is not in the delivery course.                             | None                                    |
| `LESSON_NOT_RELEASABLE`           |         409 | A lesson is no longer eligible for release.                         | `{ reason: string }`                    |
| `MODULE_NOT_ACTIVE`               |         409 | An operation requires an active module.                             | None                                    |
| `MODULE_NOT_FOUND`                |         404 | A module is not in the delivery course.                             | None                                    |
| `NOT_FOUND`                       |         404 | A requested resource does not exist in scope.                       | None                                    |
| `ORIGIN_NOT_ALLOWED`              |         403 | A write request has an unapproved origin.                           | None                                    |
| `PARENT_NOT_ACTIVE`               |         409 | A parent course must be active.                                     | None                                    |
| `PASSWORD_CHANGE_REQUIRED`        |         403 | The account must change its password before protected actions.      | None                                    |
| `PASSWORD_POLICY`                 |         400 | A password violates the password policy.                            | Array of policy violation codes         |
| `PASSWORD_REUSED`                 |         400 | The new password matches the current password.                      | None                                    |
| `PAYLOAD_TOO_LARGE`               |         413 | The request body is too large.                                      | None                                    |
| `PERMISSION_REQUIRED`             |         403 | The account lacks the required permission.                          | None                                    |
| `RELATED_DATA_CONFLICT`           |         409 | A database operation conflicts with related records.                | None                                    |
| `REPLACEMENT_IN_PROGRESS`         |         409 | An asset file is already being processed.                           | None                                    |
| `RESOURCE_IN_USE`                 |         409 | A resource has dependent records or usages.                         | None                                    |
| `ROLE_CONFIGURATION_ERROR`        |         500 | A user's role configuration is invalid.                             | None                                    |
| `SCHOOL_CODE_EXISTS`              |         409 | The school code is already assigned.                                | None                                    |
| `SCHOOL_FORBIDDEN`                |         403 | A caller who is not platform staff tries to create a school.        | None                                    |
| `SCHOOL_INACTIVE`                 |         409 | An operation requires an active school.                             | None                                    |
| `SCHOOL_REQUIRED`                 |         400 | The operation requires a school.                                    | None                                    |
| `STEAMX_ID_NOT_RENAMABLE`         |         400 | A platform staff SteamX ID is renamed.                              | None                                    |
| `STEAMX_ID_TAKEN`                 |         409 | The SteamX ID is already in use.                                    | None                                    |
| `STEAMX_ID_UNAVAILABLE`           |         409 | A SteamX ID cannot be allocated after retries.                      | None                                    |
| `STUDENT_NOT_ACTIVE`              |         409 | An inactive student is enrolled.                                    | `{ studentIds: string[] }`              |
| `STUDENT_NOT_FOUND`               |         404 | One or more students are outside the delivery school.               | `{ studentIds: string[] }`              |
| `STUDENT_WRONG_CLASS`             |         409 | A student is outside the delivery class section.                    | `{ studentIds: string[] }`              |
| `SUBSCRIPTION_ALREADY_ENDED`      |         409 | An ended subscription is changed again.                             | None                                    |
| `SUBSCRIPTION_EXPIRED`            |         403 | The school's subscription is not active.                            | None                                    |
| `SUBSCRIPTION_INVALID_DATE_RANGE` |         400 | The end date is before the start date.                              | None                                    |
| `SUBSCRIPTION_NOT_FOUND`          |         404 | A subscription does not exist in scope.                             | None                                    |
| `SUBSCRIPTION_OVERLAP`            |         409 | Subscription dates overlap for the school and course.               | None                                    |
| `TEACHER_ALREADY_ASSIGNED`        |         409 | The teacher already has an active delivery assignment.              | None                                    |
| `TEACHER_NOT_ACTIVE`              |         409 | An inactive teacher is assigned to a delivery.                      | None                                    |
| `TEACHER_NOT_ASSIGNED`            |         404 | The teacher has no active delivery assignment.                      | None                                    |
| `TOO_MANY_REQUESTS`               |         429 | A handler reports too many requests.                                | None                                    |
| `UNAUTHORIZED`                    |         401 | Framework unauthorized error without a more specific code.          | None                                    |
| `USER_NOT_MANAGEABLE`             |         400 | A platform staff account is managed through a school flow.          | None                                    |
| `VALIDATION_ERROR`                |         400 | DTO validation fails.                                               | `{ field: string, errors: string[] }[]` |
| `VERSION_CONFLICT`                |         409 | Lesson content changed since it was read.                           | `{ currentVersion: number }`            |

Other `HTTP_ERROR_CODES` entries map `400` to `BAD_REQUEST`, `401` to `UNAUTHORIZED`, `403` to
`FORBIDDEN`, `404` to `NOT_FOUND`, `409` to `CONFLICT`, `413` to `PAYLOAD_TOO_LARGE`, `429` to
`TOO_MANY_REQUESTS`, and `500` to `INTERNAL_ERROR`. A more specific exception code takes precedence.
