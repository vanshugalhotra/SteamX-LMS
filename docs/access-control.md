# Access control

## Glossary

| Term           | Meaning                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| User type      | Broad account category stored as `PLATFORM_STAFF`, `SCHOOL_STAFF`, or `STUDENT`.          |
| Role           | A database role such as `admin`, `teacher`, or `student`; each user has one role.         |
| Permission     | A named capability, such as `user.read`, granted to a role in `role_permissions`.         |
| School scope   | The school ID a service is allowed to use when querying school-owned records.             |
| Visibility     | The additional rule for which user records a caller may see, independent of school scope. |
| Platform staff | A platform-level user with no `school_id`; may act across schools when authorized.        |
| School staff   | A school-level user whose records are bound to one school. The current role is `teacher`. |

## Login and sessions

- Login normalizes the SteamX ID, checks the password and active user/school status, then issues a
  signed JWT in the `steamx_session` cookie.
- The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production. Its lifetime comes from
  `AUTH_TOKEN_TTL_SECONDS` (default: one day).
- The JWT contains the user ID, issue time, and expiry. Each protected request loads current user,
  role, and school state from PostgreSQL; deactivation takes effect without waiting for token expiry.
- The guard compares the token issue time with `passwordChangedAt`. A password change or reset
  invalidates earlier tokens; changing the password also issues a fresh cookie.
- Cookie-authenticated state changes require an allowed `Origin`. The backend does not currently
  configure a request rate limiter.

## Permission checks

`PermissionGuard` runs after authentication. A route must be explicitly public, declare a permission,
or be marked authenticated-only. Missing policy metadata is denied. A declared permission requires
an authenticated caller and a matching role grant; otherwise the guard returns 403.

Permission keys are defined in `src/auth/permissions.ts`. The migration-managed reference data grants the permissions.
At startup, `PermissionsService` loads role grants from the database and caches them in memory; restart the
backend after changing grants. Route definitions and API details are documented in Swagger.

Curriculum is global content with no school ownership or school-scope filtering. Course routes
require `curriculum.read` or `curriculum.write`, and services also require the platform `admin`
role. Reference data grants both permissions to that role only; a mistakenly granted permission
does not give curriculum access to teacher or student roles.

## School scope and user visibility

These are separate filters:

- `resolveSchoolScope` answers **which school's records can this caller query?** Platform staff may
  request a school or use an unscoped query. School staff and students are fixed to their own
  `schoolId`; requesting another school returns 404.
- `schoolFilter` turns that resolved scope into a Prisma filter. For example, resolving
  `school-a` produces a `schoolId: school-a` predicate in the database query. An undefined scope
  produces an empty predicate for platform-wide queries; only use it after resolving the caller's
  scope.
- `ActiveSchoolService.resolveSchool` is for workflows that need one specific school. It uses the
  scope rules, loads the school, and rejects missing or inactive schools. It does not replace the
  scope helper used for list and by-ID queries.
- `userVisibility` answers **which user records may this caller see?** Platform staff can see all
  users; school staff and students currently see only themselves. Teacher access to assigned users
  is not implemented.

Repositories receive filters that combine the target ID with scope and visibility before querying.
They do not fetch a foreign record and check ownership afterward. A foreign or invisible ID returns
the same 404 as a nonexistent ID, so callers cannot use responses to discover another school's data.
An authorization failure is still 403; the 404 rule applies to records the caller is otherwise
allowed to access but cannot see in scope.

## Protecting a new route or module

- Declare the route policy explicitly: `@RequirePermission`, `@AuthenticatedOnly`, or `@Public`.
- Resolve caller school scope in the service; never trust a request-supplied school ID without
  applying the scope rules.
- Put the ID, school-scope, and visibility predicates together in the database query.
- Return the same 404 for foreign and nonexistent resources.
- Add a cross-school test proving that a caller from school A cannot access a school B ID.
- If user records are involved, apply `userVisibility` in addition to school scope.
