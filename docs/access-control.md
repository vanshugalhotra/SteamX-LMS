# Access Control

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
- Password changes invalidate earlier tokens (compares `passwordChangedAt` with token issue time) and issue a fresh cookie.
- State-changing requests require an allowed `Origin`.

## Permission checks

`PermissionGuard` runs after authentication:

- Routes must declare `@RequirePermission`, `@AuthenticatedOnly`, or `@Public`. Missing metadata → 403.
- A declared permission requires auth + a matching role grant.
- Permission keys: `src/auth/permissions.ts`. Grants loaded at startup and cached in memory — **restart after changing grants**.
- **Curriculum** is global (no school scope). Routes need `curriculum.read`/`curriculum.write` and services also require platform-staff user type. School staff/students are denied even with permissions.
- **Assets** are global (no school scope). List, detail, file-state, and preview routes require `asset.read`; create, replace, complete, update, status, and delete routes require `asset.write`. Both permissions are granted to `admin` by default; `teacher` and `student` receive neither. Preview URLs additionally require `PLATFORM_STAFF`, even if another role is granted `asset.read`.

An asset ID alone never grants access to non-admins. A future student path must check lesson,
delivery, and subscription access before requesting a URL.

## School scope vs. user visibility

Two separate filters:

| Helper                              | Question it answers                                   |
| ----------------------------------- | ----------------------------------------------------- |
| `resolveSchoolScope`                | Which school's records can this caller query?         |
| `schoolFilter`                      | Turns resolved scope into a Prisma `where` predicate. |
| `ActiveSchoolService.resolveSchool` | Loads + validates one specific school for workflows.  |
| `userVisibility`                    | Which user records can this caller see?               |

Key rules:

- Platform staff may request any school or go unscoped. School users are fixed to their own `schoolId`.
- Repositories combine target ID + scope + visibility in a single query — never fetch-then-check.
- Foreign or invisible IDs return 404 (same as nonexistent) to prevent cross-school discovery.

## Adding a new protected route

1. Declare route policy: `@RequirePermission`, `@AuthenticatedOnly`, or `@Public`.
2. Resolve caller school scope in the service — never trust a request-supplied school ID.
3. Combine ID + scope + visibility predicates in the query.
4. Return 404 for foreign and nonexistent resources alike.
5. Add a cross-school e2e test (school A user → school B resource → 404).
6. Apply `userVisibility` if user records are involved.
