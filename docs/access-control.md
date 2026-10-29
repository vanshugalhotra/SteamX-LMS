# Access Control

This guide explains authentication, permission checks, and user visibility. Use it when adding a
protected route or changing account-management behavior; see the [API test checklist](./api-testing.md)
for endpoint cases.

## Glossary

| Term           | Meaning                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| User type      | `PLATFORM_STAFF`, `SCHOOL_STAFF`, or `STUDENT`.                               |
| Role           | Database role (`admin`, `teacher`, `student`); one per user.                  |
| Permission     | Named capability (e.g. `user.read`) granted to a role via `role_permissions`. |
| School scope   | Which school's records a caller can query.                                    |
| Platform staff | No `school_id`; may act across schools when authorized.                       |
| School staff   | Bound to one school. Current role: `teacher`.                                 |

## Sessions

- Login normalizes the SteamX ID, verifies the password, checks active user/school status, then sets a JWT in the `steamx_session` cookie.
- Cookie: `httpOnly`, `SameSite=Lax`, `Secure` in production. TTL from `AUTH_TOKEN_TTL_SECONDS` (default: 1 day).
- Each protected request loads current user, role, and school from PostgreSQL — deactivation takes effect immediately.
- Password changes update `passwordChangedAt` and issue a fresh cookie. Tokens issued before that
  timestamp are rejected; tokens issued in the same whole second are not distinguished and may
  remain valid until expiry.
- State-changing requests require an allowed `Origin`.

## Permission checks

`PermissionGuard` runs after authentication:

- Routes must declare `@RequirePermission`, `@AuthenticatedOnly`, or `@Public`. Missing metadata → 403.
- A declared permission requires auth + a matching role grant.
- Permission keys: `apps/backend/src/auth/permissions.ts`. Grants are loaded at startup and cached
  in memory — **restart after changing grants**.
- **Curriculum** is global (no school scope). Routes need `curriculum.read`/`curriculum.write` and services also require platform-staff user type. School staff/students are denied even with permissions.
- **Assets** are global (no school scope). List, detail, file-state, and preview routes require `asset.read`; create, replace, complete, update, status, and delete routes require `asset.write`. Both permissions are granted to `admin` by default; `teacher` and `student` receive neither. Preview URLs additionally require `PLATFORM_STAFF`, even if another role is granted `asset.read`.

An asset ID alone never grants access to non-admins. A future student path must check lesson,
delivery, and subscription access before requesting a URL.

## School scope vs. user visibility

Two separate filters:

| Helper                              | Question it answers                                               |
| ----------------------------------- | ----------------------------------------------------------------- |
| `resolveSchoolScope`                | Which school's records can this caller query?                     |
| `schoolFilter`                      | Turns resolved scope into a Prisma `where` predicate.             |
| `ActiveSchoolService.resolveSchool` | Requires a concrete in-scope school and checks that it is active. |
| `userVisibility`                    | Which user records can this caller see?                           |

Key rules:

- Platform staff may request any school or go unscoped. School users are fixed to their own `schoolId`.
- Repositories combine target ID + scope + visibility in a single query — never fetch-then-check.
- Foreign or invisible IDs return 404 (same as nonexistent) to prevent cross-school discovery.
- School status does not alter a school user's `schoolId`; authentication rejects that user while
  the school is inactive. Workflows that create school-owned records also require an active school.
- Platform staff can see all user records. School staff and students currently see only their own
  user record, even when they have `user.read`.

## School and class-section access

- `school.read` and `school.manage` guard school read and management routes. School creation has an
  additional service rule: only `PLATFORM_STAFF` can create schools.
- School staff can read or manage only their own school when granted the route permission.
  Platform staff can work across schools; an explicit `schoolId` narrows the query.
- `classsection.read` and `classsection.manage` guard section reads and writes. Section queries
  always include resolved school scope; foreign IDs return the same 404 as missing IDs.
- Class-section creation resolves the selected school with `ActiveSchoolService`, so it requires a
  school ID for platform staff and an active in-scope school for every caller.

## Subscriptions

- `subscription.manage` is restricted to platform staff; grants and renewals require an active school and course, and status is derived from subscription dates and the database business date.
- Revoke deletes access that has not started, otherwise ends it yesterday; renew creates a new row and restores date-derived access without changing deliveries.
- `retainedUntil` is informational, derived from the latest school-course end date plus two years, and only governs when purge is allowed.

### Subscription gating

- Services should call `CourseAccessService.assertCourseAccess(actor, schoolId, courseId)` before
  returning or mutating course content. Pass the school ID from the loaded resource, not client
  input; school-bound actors are checked against that resource school and foreign resources return
  404. Platform staff bypass the subscription check inside the service.
- Use `getAccessibleCourseIds(actor)` to filter a school-bound actor's course list to currently
  valid subscriptions; the service takes the school from the actor. Platform staff should use
  their explicit school filter directly instead. Subscription dates use database
  `business_today()`; inactive courses are not checked here.
- School status is checked by `AuthGuard`; subscription status is checked by this service.
- Denied course access returns `403 SUBSCRIPTION_EXPIRED`.

See the [school and class-section API cases](./api-testing.md#schools) and
[architecture flow](./architecture.md#schools-and-class-sections) for implementation owners.

## Auth and user lifecycle

| Workflow               | Route or owner                                 | Behavior                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in / sign out     | `POST /auth/login`, `POST /auth/logout`        | Login verifies an active user and school, then sets the `steamx_session` cookie. Logout clears the browser cookie; it does not revoke a copied token.                                                                                    |
| Current profile        | `GET /auth/me`                                 | Returns the profile loaded for the current request; password hashes are not returned.                                                                                                                                                    |
| Change password        | `POST /auth/change-password`                   | Verifies the current password, applies the shared policy, updates the password timestamp, and issues a new cookie.                                                                                                                       |
| Create teacher/student | `POST /users/teachers`, `POST /users/students` | Checks active school scope, generates a school-prefixed SteamX ID, and creates the user and required profile in one transaction. New accounts require a password change.                                                                 |
| Manage account         | `/users/:id` routes                            | Reads and writes apply both school scope and user visibility. Deactivation blocks the next authenticated request; a password reset forces a change at login and revokes older sessions subject to the whole-second timestamp rule above. |

User creation takes an initial password and stores its hash. Student profiles require a class
section from the same school. Profile, status, and SteamX ID changes are limited to school users;
password reset is a separate operation and rejects self-reset. See [workflow testing](./workflows-testing.md)
for end-to-end account scenarios and [database rules](./database.md#identity--users) for enforced
identity constraints.

## Adding a new protected route

1. Declare route policy: `@RequirePermission`, `@AuthenticatedOnly`, or `@Public`.
2. Resolve caller school scope in the service — never trust a request-supplied school ID.
3. Combine ID + scope + visibility predicates in the query.
4. Return 404 for foreign and nonexistent resources alike.
5. Add a cross-school e2e test (school A user → school B resource → 404).
6. Apply `userVisibility` if user records are involved.
