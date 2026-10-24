# Workflow testing

This guide covers workflows implemented by the current backend. API details and exact field
requirements are in Swagger at `/api/docs`; this guide names routes and outcomes, not payloads.

## Test data setup

1. Use a dedicated local PostgreSQL database. Never point reset commands at shared or production data.
2. Copy `apps/backend/.env.example` to `apps/backend/.env` and set `DATABASE_URL`, a strong
   `AUTH_JWT_SECRET`, and an allowed local frontend Origin in `CORS_ORIGINS`.
3. Install packages and generate Prisma client if needed:
   `pnpm install`, then `pnpm --filter @steamx/backend prisma:generate`.
4. Apply committed schema/reference data with `pnpm --filter @steamx/backend migrate:deploy`.
   The reference migration creates `admin`, `teacher`, and `student` roles; all current permissions
   are granted to admin only. There is no Prisma seed script and no default admin account.
5. Set `ADMIN_STEAMX_ID` and `ADMIN_PASSWORD`, then run
   `pnpm --filter @steamx/backend admin:create`. This creates the first admin and sets
   `mustChangePassword`.
6. For an empty local database, `pnpm --filter @steamx/backend exec prisma migrate reset` drops and
   recreates the schema and reapplies migrations. It does not seed an admin; run `admin:create`
   afterward. Confirm `DATABASE_URL` first.
7. Start the backend with `pnpm --filter @steamx/backend start:dev`. Use the allowed Origin on every
   POST, PATCH, and DELETE request.
8. To test school-staff route scope, add the needed permission to the `teacher` role in the isolated
   test database before backend startup, then restart the app. The app caches permissions at startup.
   This changes test setup only; migration defaults still grant permissions to admin only.
9. Create at least two schools and one section in each. Create teachers and students in both schools
   through the user APIs. New users have `mustChangePassword`; create a separate password-ready
   admin or complete its forced password change before normal testing.

## Asset upload

**Goal:** Create an asset, upload its bytes directly to storage, and verify the completed file becomes READY.

**Preconditions:** Admin session with `asset.write`; `asset.read` for checking state; test storage available. For staging, use the browser-based asset upload smoke test in [infrastructure.md](./infrastructure.md) with small test files.

1. Call `POST /api/v1/assets` with type, title, filename, MIME, and exact byte size. Save the returned asset ID, file ID, URL, method, and headers.
2. Upload the bytes directly to the returned URL using the returned method and headers. Do not change the signed `Content-Type` or content length.
3. Call `GET /api/v1/assets/:id/files/:fileId`; before completion the state is `UPLOADING`.
4. Call `POST /api/v1/assets/:id/files/:fileId/complete`. For matching size, content type, and file signature, expect `200 READY`; repeat and expect the same state.
5. For VIDEO, verify the playback key is the original storage key. For IMAGE and PDF, playback key is null.
6. Call complete before uploading on a fresh file; expect retryable `409 UPLOAD_NOT_COMPLETE` and `UPLOADING`. Upload, retry complete, and expect `READY`.
7. To check verification failures, upload (a) a text payload declared as an allowed image/PDF MIME, (b) bytes with a mismatched content type, and (c) a body whose actual size differs if the storage signer permits it. Completion returns `200 FAILED` with a stable `lastError` (`CONTENT_NOT_RECOGNIZED`, `TYPE_MISMATCH`, or `SIZE_MISMATCH`). Repeating completion leaves FAILED unchanged.
8. If replacing an existing file, do not delete the serving READY file until the new file has processed. `makeReady` performs the swap under an asset-row lock; the database queues the old file prefix for cleanup.
9. Call `GET /api/v1/assets/:id/access` to preview the READY file. Expect a short-lived URL and `Cache-Control: no-store`; use it inline for the image, PDF, or video. Request a fresh URL if a fetch returns `403`, since viewers may continue making byte-range requests until the configured TTL expires.
10. For a minimal browser-based access check using an existing READY asset, run `pnpm --dir apps/backend asset:access:smoke --port 5174`, open `http://localhost:5174`, and enter the admin credentials and asset ID. Confirm the `206` byte-range result and media preview; the page does not print the signed URL.
11. Rename the asset with `PATCH /api/v1/assets/:id`, including surrounding title whitespace, and verify the trimmed title in its detail and library responses.
12. Archive it with `PATCH /api/v1/assets/:id/status`; verify it disappears from the default library but remains inspectable and previewable. Unarchive it and verify it returns to the default library.
13. Reference the asset from a lesson block, then call `DELETE /api/v1/assets/:id`; expect `409 RESOURCE_IN_USE` and verify its file rows remain. Remove the block, retry deletion, and expect `204`. Storage objects are deleted later by the cleanup worker.

## First admin login and password change

**Goal:** Confirm first-admin provisioning, forced password update, and session replacement.

**Preconditions:** Migrations applied; no platform admin exists; `ADMIN_STEAMX_ID`,
`ADMIN_PASSWORD`, and allowed Origin configured.

1. Run `pnpm --filter @steamx/backend admin:create`.
2. Call `POST /api/v1/auth/login` with the configured admin credentials.
3. Expect login to succeed and mark password change as required.
4. Call `GET /api/v1/auth/me` with the new cookie; expect it to work.
5. Call any protected non-password-change route; expect `403 PASSWORD_CHANGE_REQUIRED`.
6. Call `POST /api/v1/auth/change-password` with the current and a valid new password.
7. Expect success and a refreshed cookie.
8. Call the protected route with the new cookie; expect normal permission checks to apply.
9. After the token timestamp has advanced past the previous whole second, replay the old cookie;
   expect `401 UNAUTHORIZED`.
10. Call `POST /api/v1/auth/logout` with the new cookie; expect `204` and a cleared browser cookie.

## Admin creates schools, teacher, and student accounts

**Goal:** Create the school structure and verify new-user first-login behavior.

**Preconditions:** A usable admin session; admin has default school and user permissions.

1. As admin, call `POST /api/v1/schools` twice to create School A and School B.
2. Call `POST /api/v1/class-sections` for each school.
3. Call `POST /api/v1/users/teachers` to create one teacher in each school.
4. Call `POST /api/v1/users/students` to create one student in each school, using a section from
   that student's school.
5. Expect each account to have a generated school-prefixed ID and require a password change.
6. Log in as each teacher with the temporary password; expect login success and forced-change state.
7. Log in as each student with the temporary password; expect login success and forced-change state.
8. As each account, call `POST /api/v1/auth/change-password`; expect success and a fresh cookie.
9. As each account, call `GET /api/v1/auth/me`; expect forced-change state cleared.
10. As each account, call a permission-protected admin route; expect `403` unless a grant was
    explicitly added before backend startup.

## Password reset and revocation

**Goal:** Verify admin reset invalidates the user's earlier session and forces a new password change.

**Preconditions:** Admin and school-user accounts with valid sessions. Ensure reset and password
change occur in different whole seconds when checking old-token revocation.

1. Log in as the target and save its cookie.
2. As admin, call `POST /api/v1/users/:id/reset-password` for the target.
3. Expect `204`.
4. Replay the target's old cookie after the next whole second; expect `401 UNAUTHORIZED`.
5. Log in with the reset password; expect success with forced-change state.
6. Try the old password; expect `401 UNAUTHORIZED`.
7. Try a protected normal route with the reset login cookie; expect `403 PASSWORD_CHANGE_REQUIRED`.
8. Call `POST /api/v1/auth/change-password`; expect a fresh cookie and normal access afterward.
9. Attempt reset as teacher or student with default grants; expect `403 FORBIDDEN`.
10. Even if a teacher is given `user.password.reset`, attempt to reset another account; current
    self-only user visibility returns `404`. Attempt self-reset; expect `400 CANNOT_RESET_OWN_PASSWORD`.

## User profile and status lifecycle

**Goal:** Verify supported profile changes, no-op status updates, deactivation, and reactivation.

**Preconditions:** Admin session; one teacher, one student, and valid user sessions.

1. As admin, call `PATCH /api/v1/users/:id` for the teacher and update valid teacher fields.
2. Expect trimmed name/assignment values and lowercase email in the returned profile.
3. Call the same route with a student-only field on the teacher; expect `400 FIELD_NOT_APPLICABLE`.
4. Call the same route with a teacher-only field on the student; expect `400 FIELD_NOT_APPLICABLE`.
5. Call `PATCH /api/v1/users/:id/status` to deactivate the teacher.
6. Immediately call `GET /api/v1/auth/me` with the teacher's old cookie; expect `401 UNAUTHORIZED`.
7. Try login as the inactive teacher; expect `401 UNAUTHORIZED`.
8. As admin, reactivate the teacher; expect `200`.
9. Retry the old cookie if still unexpired and not password-revoked; expect access to work again.
10. Repeat the status update with the same value; expect `200`.
11. As admin, attempt to deactivate own account; expect `400 CANNOT_DEACTIVATE_SELF`.
12. Attempt to manage a platform-staff target; expect `400 USER_NOT_MANAGEABLE`.

## Student class-section change

**Goal:** Confirm section ownership checks and record the currently incomplete enrollment behavior.

**Preconditions:** Admin session; student in School A; one section in each of Schools A and B.

1. As admin, call `PATCH /api/v1/users/:id` for the student and select another School A section.
2. Expect `200` and the student's current profile section to change.
3. Call the same route with School B's section ID.
4. Expect `404 NOT_FOUND` and the student's section to remain unchanged.
5. Select the student's current section again; expect a successful no-op response.
6. If test data includes delivery enrollments, inspect their status after a valid class change.
   Current code does not update old-class enrollments; this is a pending TODO.

## SteamX ID generation and rename

**Goal:** Check name parsing, uniqueness retry, validation, and old-ID login behavior.

**Preconditions:** Admin session; active school with known code; create users in an isolated database.

1. As admin, call `POST /api/v1/users/teachers` using a short name; expect a generated ID with
   school code, at least four name-part letters, and three digits.
2. Repeat with a one-token name; expect up to eight letters from that token.
3. Repeat with a leading honorific and a multi-part name; expect the leading honorific to be dropped
   and the first name/last initial to be used.
4. Repeat with a non-Latin name; expect non-A–Z characters to be removed and random filler letters
   to supply the minimum name-part length when necessary.
5. To force a collision, use the existing E2E collision test setup or reserve the first candidate
   in an isolated test database; expect the service to retry another candidate.
6. Force three candidate collisions; expect `409 STEAMX_ID_UNAVAILABLE`.
7. As admin, call `PATCH /api/v1/users/:id/steamx-id` with an available ID matching the target
   school's prefix and format; expect `200`.
8. Call `POST /api/v1/auth/login` with the old ID; expect `401`. Log in with the new ID; expect
   success.
9. Try a wrong school prefix or malformed name/digit part; expect `400 INVALID_STEAMX_ID`.
10. Try an ID already used by another user; expect `409 STEAMX_ID_TAKEN`.
11. Try renaming platform staff; expect `400 STEAMX_ID_NOT_RENAMABLE`.
12. Reuse a cookie issued before rename; the token identifies the immutable user UUID, so verify it
    remains valid unless another revocation condition applies.

## Two-school isolation walkthrough

**Goal:** Show the distinction between permission denial and resource scope denial.

**Preconditions:** Two active schools, sections, teachers, and students. Admin session. Before
starting the backend, grant teacher the read permissions needed to reach school and class-section
routes; restart so the cached permission map includes them. User list/detail still applies its
self-only visibility rule.

1. As admin, call `GET /api/v1/schools/:id` for both schools; expect `200`.
2. As School A teacher with `school.read`, call the same route for School A; expect `200`.
3. As School A teacher, request School B ID; expect `404 NOT_FOUND`.
4. As School A teacher, call `GET /api/v1/class-sections` without a school filter; expect only
   School A sections.
5. As School A teacher, supply School B's `schoolId`; expect `404 NOT_FOUND`.
6. As School A teacher, request a School B section ID; expect `404 NOT_FOUND`.
7. Compare the foreign section response with a random missing section ID; expect same status/code/
   message, apart from per-request ID.
8. Repeat steps 2–7 as School B teacher, using a School A ID as the foreign resource.
9. As either teacher, call a user list/detail route with a temporary `user.read` grant; expect only
   that teacher's own user record. A different user, even in the same school, is currently invisible.
10. As admin, call `GET /api/v1/users` without `schoolId`; expect platform-wide records.
11. As admin, call it with School A `schoolId`; expect only School A user records.

## Permission matrix walkthrough

**Goal:** Confirm the default policy for all three seeded roles.

**Preconditions:** Admin, teacher, and student have active accounts and sessions. Use default
migration grants unless explicitly checking custom test grants.

1. As each role, call `POST /api/v1/auth/login`; expect success with valid credentials.
2. As each role, call `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`; expect authentication-only access.
3. As each role, call `POST /api/v1/auth/change-password`; expect access for the account owner.
4. As admin, call each school, class-section, and user management/read route with valid input;
   expect access subject to validation, scope, and state rules.
5. As teacher, call school create/manage, class-section, and user routes with default grants;
   expect `403 FORBIDDEN`.
6. As student, call the same permission-protected routes; expect `403 FORBIDDEN`.
7. As teacher/student, call `POST /api/v1/users/:id/reset-password`; expect `403 FORBIDDEN`.
8. As teacher with a custom `school.read` grant configured before startup, read only their school;
   requests for another school still return `404`.
9. As teacher with custom class-section read/manage grants, verify own-school reads/writes and
   foreign-ID `404` behavior.
10. Restart backend after grant changes; without restart, the in-memory permission map remains stale.

## User-list pagination and filters

**Goal:** Check search, filters, ordering, page boundaries, and private-field omission.

**Preconditions:** Admin session and enough users in at least two schools, with varied role, status,
email, names, and creation times.

1. Call `GET /api/v1/users` with no paging parameters; expect page 1, limit 20.
2. Add `role`, `status`, `schoolId`, and `q` one at a time; verify each filter independently.
3. Combine filters; expect only users matching every supplied filter.
4. Search partial values in name, SteamX ID, and email with different casing; expect matching rows.
5. Request multiple pages with a small limit; expect stable order by newest creation time, then ID.
6. Request the page after the last result; expect empty items and unchanged total.
7. Request an unmatched search; expect total zero and empty items.
8. Request limit above 100 or page above 100000; expect `400 VALIDATION_ERROR`.
9. Inspect every result; expect no password hash.
10. As a school user with `user.read`, expect their list to contain only themselves, even if the
    search/filter would match another user.

## Failure and recovery

**Goal:** Confirm retry safety and that invalid requests do not partially create records.

**Preconditions:** Admin session; disposable database; unique test names/codes.

1. Call `POST /api/v1/schools` with a duplicate code; expect `409 SCHOOL_CODE_EXISTS`.
2. Correct the code and retry; expect `201`.
3. Call `POST /api/v1/class-sections` with a duplicate class/section pair in the same school;
   expect `409 CLASS_SECTION_EXISTS`.
4. Correct one name and retry; expect `201`.
5. Call `POST /api/v1/users/teachers` with an email already in use; expect `409 CONFLICT`.
6. Correct the email and retry; expect `201`.
7. Call a create route with an invalid field, then correct the field and retry; expect the invalid
   request to leave no partial account/profile/school/section.
8. Retry a successful user-create operation without a stable unique value; expect a new account may
   be created. The API has no idempotency-key support.
9. Trigger a teacher-profile insert failure in a test environment; expect the entire user/profile
   transaction to roll back.
10. For status/ID/password changes, check that failed validation or foreign-school references leave
    the prior database state unchanged.

## Additional implemented invariants

- Deactivating a school rejects its users' login and existing sessions; reactivating the school
  restores access unless the user has another invalidation condition.
- An inactive user cannot log in and loses access on the next protected request.
- A password reset invalidates earlier sessions and sets forced password change.
- A foreign resource ID and a missing ID return `404 NOT_FOUND` where a permitted caller is scoped.
- Database checks and triggers reject invalid formats, missing required profiles, and immutable
  identity changes even when application validation is bypassed.
- `GET /health/live` does not query the database; `GET /health/ready` returns `503` when its
  database check fails.

## Course authoring workflow

- School subscription creation/renewal, date boundaries, delivery caps, and school/course isolation.
- Create a course and call `GET /api/v1/courses/:id/outline`; verify course fields and `modules: []`.
- Add modules and call the outline after each addition; verify position order and `lessons: []` for
  modules without lessons.
- Add lessons and call the outline after each addition; verify their module nesting and position order.
- Reorder modules and lessons, calling the outline after each reorder to verify both orders.
- Move a lesson to another module, delete content, and call the outline after each change to verify
  the current hierarchy and position gaps.
- Activate course → modules → lessons top-down, calling the outline after each status change to
  verify the updated status.
- Archive an active course and verify the outline shows the database cascade to active modules and
  lessons only; draft descendants stay draft and reactivation does not revive archived descendants.
- Delete an empty lesson, module, and course; verify deletion is blocked with `RESOURCE_IN_USE` when dependent records remain.
- Verify lesson audiences, including teacher-only lessons and lessons visible to students.
- Private asset upload, processing failure, replacement, signed access, and queued storage cleanup:
  - Complete an image, PDF, and video upload, then replace each through `POST /api/v1/assets/:id/files`; while each replacement is UPLOADING, verify `GET /assets/:id` and `/access` still use the old READY file.
  - Complete each replacement and verify its new file is READY, its old row is gone, and the old prefix is queued for asynchronous cleanup. Confirm video access signs the new file's playback key.
  - Upload text bytes declared as an image and complete; verify the replacement becomes FAILED, the previous READY file remains served, and its prefix is not queued.
  - Seed UPLOADED or PROCESSING state and verify replacement returns `409 REPLACEMENT_IN_PROGRESS` without changing rows. Seed an older UPLOADING or FAILED attempt and verify the new attempt supersedes it and completion of the old file ID returns `404`.
  - With no READY file after a failed or abandoned first upload, use the same replacement route as a retry and verify successful completion makes the asset appear in `GET /assets`.
  - Verify an in-progress or failed replacement does not hide an existing READY asset from `GET /assets`, and `GET /assets/:id` still shows distinct lessons where the asset is used.
- Delivery setup, teacher assignment history, lesson release, enrollment, re-enrollment, and progress.
- Assignment template publishing, student submission, file upload, grading, and regrading.
- Student promotion that completes old-class enrollments and validates cross-school moves.
