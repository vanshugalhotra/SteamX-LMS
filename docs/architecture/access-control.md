# Access control

This guide explains route authorization and school scoping; use it when adding a protected route
or changing who can see a resource.

## Request authorization

For HTTP requests, the global guards run in this order:

1. `OriginGuard` requires a configured Origin for POST, PUT, PATCH, and DELETE.
2. `AuthGuard` checks the session cookie and reloads current user, role, and school state.
3. `PermissionGuard` requires `@Public`, `@AuthenticatedOnly`, or `@RequirePermission`.

Missing route-policy metadata fails with 403. Permission grants are loaded at startup, so restart
the API after changing grants. State-changing requests without an allowed Origin fail before
authentication. Health routes are public.

## Sessions and account state

- Login sets the `steamx_session` JWT cookie. It is `httpOnly`, `SameSite=Lax`, and `Secure` in
  production; its lifetime is `AUTH_TOKEN_TTL_SECONDS` (default 86,400).
- Every protected request loads current account and school status. Deactivation applies on the next
  request.
- Password changes invalidate tokens issued before `passwordChangedAt`. Token timestamps use
  whole seconds, so a token issued in the same second may remain valid.
- New and reset accounts must change their password before using protected routes. The auth profile
  and logout routes remain available.

## Permission, school scope, and visibility

Roles (`admin`, `teacher`, `student`) receive named permissions through `role_permissions`.
Permission names are defined in `apps/backend/src/auth/permissions.ts`; default grants are seeded
by migrations.

| Actor                   | School scope                                                | User records visible          |
| ----------------------- | ----------------------------------------------------------- | ----------------------------- |
| Platform staff          | Any school, or all schools if no school filter is supplied. | All users.                    |
| School staff or student | Only the authenticated user's school.                       | The caller's own user record. |

Resolve scope with `resolveSchoolScope` and apply it in the repository query with the target ID.
Do not fetch a record and check its school afterward. Foreign or invisible IDs return the same 404
as missing IDs.

School-owned workflows that require an active school use `ActiveSchoolService`. Authentication
rejects school users while their school is inactive; it does not change their stored user status.

## Learning and subscription access

- Curriculum and asset-management data are global. Curriculum services also require platform staff;
  an assigned permission alone does not grant school users authoring access.
- Students need an active enrollment in an active delivery. They can see ACTIVE or ARCHIVED
  STUDENT lessons released to that delivery.
- Assigned teachers need an active assignment in an active delivery. They can read ACTIVE or
  ARCHIVED lessons, including TEACHER_ONLY and unreleased lessons. DRAFT lessons are hidden.
- School-bound learning actors must match the loaded resource's school and have a current course
  subscription. Hidden or foreign learning resources return 404; expired subscription access
  returns 403 after visibility checks.
- Platform staff bypass subscription checks in `CourseAccessService.assertCourseAccess`, but
  subscription-gated writes call `assertSubscriptionActive` and still require an active term.
- Asset access is through a visible lesson reference, not an asset ID alone. The returned URL is
  temporary.

See [database constraints](./database.md) and [API test cases](../testing/api-testing.md) for
persistence and route-level rules.

## Adding a protected route

1. Declare the route policy.
2. Resolve school scope from the authenticated actor, not an untrusted school ID.
3. Apply target ID, scope, and visibility in the same repository query.
4. Return 404 for foreign and missing resources alike.
5. Add an end-to-end test for the in-scope and cross-school cases.
