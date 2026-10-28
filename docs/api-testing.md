# API testing checklist

Use Swagger at `/api/docs` for the API contract. Routes below use the `/api/v1` prefix, except
health checks. A `400` from DTO validation uses `VALIDATION_ERROR`; malformed path UUIDs rejected
by `ParseUUIDPipe` use `BAD_REQUEST`, while valid but unknown IDs return `404 NOT_FOUND`. Error
responses include a request ID.

## Before testing

- Apply migrations to an isolated development or test database.
- The reference-data migration creates `admin`, `teacher`, and `student` roles.
- It grants every current permission to `admin` only. Teachers and students get `403` on
  permission-protected routes unless grants are added before the backend starts. Curriculum
  services additionally require platform staff, even if a school role is mistakenly granted its
  permissions.
- Permission grants are loaded into memory at startup. Restart the backend after changing them.
- For write requests, send an `Origin` listed in `CORS_ORIGINS`; otherwise `OriginGuard` returns
  `403 ORIGIN_NOT_ALLOWED` before authentication or permission checks.
- Auth and test fixtures use database users and schools. Do not use production data for manual tests.
- Labels: `[auto]` means an existing automated test covers the case; `[auto: known-failing]` means
  an automated regression test exposes a current behavior mismatch; `[manual]` means add or run the
  case outside the current automated coverage.

## Authentication

### `POST /auth/login`

Caller: public; checks credentials and sets a session cookie for an active user in an active school.

- [auto] When credentials are valid and `Origin` is allowed -> expect `200` and an `httpOnly` session cookie.
- [auto] When SteamX ID has surrounding spaces or lowercase letters -> expect normalization and successful login.
- [auto] When platform staff has no school -> expect successful login.
- [auto] When ID is unknown, password is wrong, user inactive, or school inactive -> expect the same `401 UNAUTHORIZED`.
- [auto] When login body has empty required fields -> expect `400 VALIDATION_ERROR`.
- [auto] When body has an unknown field, wrong field type, or SteamX ID exceeds 64 characters -> expect `400 VALIDATION_ERROR`.
- [auto] When SteamX ID contains only whitespace -> expect `400 VALIDATION_ERROR` after trimming; a whitespace password is checked as supplied and fails credentials with `401`.
- [auto] When `Origin` is missing, `null`, malformed, or not allowed -> expect `403 ORIGIN_NOT_ALLOWED`.
- [auto] When repeated login attempts are made -> no `429` rate-limit response is currently implemented; each failure remains `401 UNAUTHORIZED`.
- [auto] When login succeeds -> expect no `passwordHash` in the profile and `Cache-Control: no-store`.

### `POST /auth/logout`

Caller: any authenticated role, including a user required to change their password; clears the browser cookie.

- [auto] When an active valid cookie and allowed `Origin` are sent -> expect `204` and a cleared cookie.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When password change is required -> expect logout remains available and returns `204`.
- [auto] When `Origin` is disallowed -> expect `403 ORIGIN_NOT_ALLOWED` before checking the session.
- [auto] When an old copied cookie is replayed after logout -> expect it to remain valid until expiry unless another revocation rule applies; logout clears only the browser cookie.

### `GET /auth/me`

Caller: any authenticated role, including a user required to change their password; returns the current profile.

- [auto] When a valid cookie is sent -> expect `200` and `Cache-Control: no-store`.
- [auto] When cookie is absent, malformed, expired, or has an invalid signature -> expect `401 UNAUTHORIZED`.
- [auto] When token subject is missing from the database -> expect `401 UNAUTHORIZED`.
- [auto] When user or school is inactive -> expect `401 UNAUTHORIZED`.
- [auto] When token was issued before `passwordChangedAt` -> expect `401 UNAUTHORIZED`.
- [auto] When token and `passwordChangedAt` are in the same whole second -> expect the token to remain valid.
- [auto] When account requires a password change -> expect `/auth/me` remains available and reports that state.
- [auto] When profile is returned -> expect no `passwordHash`.
- [auto] When a valid route cookie is combined with an invalid `Origin` on this GET -> Origin is not required for GET.

### `POST /auth/change-password`

Caller: any authenticated role, including a user required to change their password; changes the caller's password and refreshes their cookie.

- [auto] When current password and new password are valid -> expect `200`, cleared forced-change state, and a new cookie.
- [auto] When current password is wrong -> expect `400 INVALID_CURRENT_PASSWORD`.
- [auto] When new password equals current password -> expect `400 PASSWORD_REUSED`.
- [auto] When new password violates policy -> expect `400 PASSWORD_POLICY` with policy details.
- [auto] When new password is shorter than 8 characters, has leading/trailing whitespace, is on the weak-password list, or contains the SteamX ID -> expect `400 PASSWORD_POLICY`.
- [auto] When password is valid but has no special character or digit -> expect acceptance; no character-composition rule exists.
- [auto] When required password fields are missing or non-string, or exceed DTO length limits -> expect `400 VALIDATION_ERROR` (100-character new passwords are accepted; over 100 are rejected).
- [auto] When old cookie predates the password update by at least one second -> expect `401 UNAUTHORIZED` on its next protected request.
- [auto] When old and new token have the same issue-time second -> the old token may remain valid until the next second boundary.
- [auto] When user no longer exists -> expect `401 UNAUTHORIZED`.
- [auto] When state-changing request has no allowed Origin -> expect `403 ORIGIN_NOT_ALLOWED`.

## Courses

### `POST /courses`

Caller: platform `admin` with `curriculum.write`; creates a global course in `DRAFT`.

- [auto] When admin sends a trimmed nonblank title and optional description -> expect `201`.
- [auto] When title is empty, whitespace-only, or over 200 characters -> expect `400 VALIDATION_ERROR`.
- [auto] When description exceeds 2000 characters or an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When teacher/school staff or student calls, even with curriculum permissions granted -> expect `403 FORBIDDEN`.
- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.

### `GET /courses`

Caller: platform `admin` with `curriculum.read`; lists global courses.

- [auto] When admin lists courses -> expect paginated `items`, `page`, `limit`, and `total`.
- [auto] When `status` is supplied -> expect only courses with that content status.
- [auto] When `q` is partial and differently cased -> expect case-insensitive title matching.
- [auto] When results share a creation timestamp -> expect stable ID ordering after newest-first creation ordering.
- [auto] When page and limit are supplied -> expect the matching deterministic slice.
- [auto] When teacher/school staff or student calls, even with curriculum permissions granted -> expect `403 FORBIDDEN`.
- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.

### `GET /courses/:id`

Caller: platform `admin` with `curriculum.read`; reads a global course.

- [auto] When admin requests an existing course -> expect `200` and only the course response fields.
- [auto] When ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls, even with curriculum permissions granted -> expect `403 FORBIDDEN`.

### `GET /courses/:id/outline`

Caller: platform `admin` with `curriculum.read`; reads the complete, unfiltered global outline.

- [auto] When the course has several modules and lessons -> expect only the documented nested
  `course` object, modules, and lessons, ordered by position at both levels.
- [auto] When module or lesson positions have gaps after deletion -> expect the remaining content in
  ascending position order without renumbering.
- [auto] When course/module/lesson statuses are mixed -> expect all statuses and lesson audiences;
  no status or audience filtering is applied.
- [auto] When the course has no modules -> expect `modules: []`; when a module has no lessons ->
  expect `lessons: []`.
- [auto] After reorder, moving a lesson to another module, deletion, or archive cascade -> expect
  the next outline read to reflect the current hierarchy and statuses.
- [auto] When the course has 20 modules with 10 lessons each -> expect all 200 lessons and
  position-ordered modules and lessons.
- [auto] When the ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When teacher, school staff, or student calls, even with `curriculum.read` granted ->
  expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.
- [auto] When the response is returned -> verify no fields exist outside the documented nested set.

### `PATCH /courses/:id`

Caller: platform `admin` with `curriculum.write`; updates title and/or description.

- [auto] When admin updates valid fields -> expect `200` with trimmed values.
- [auto] When body is empty, title is blank/null/too long, or an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When description is set to null -> expect `200` with a cleared description.
- [auto] When ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls, even with curriculum permissions granted -> expect `403 FORBIDDEN`.

### `PATCH /courses/:id/status`

Caller: platform `admin` with `curriculum.write`; changes global course status.

- [auto] When admin requests `DRAFT -> ACTIVE`, `DRAFT -> ARCHIVED`, `ACTIVE -> ARCHIVED`, or `ARCHIVED -> ACTIVE` -> expect `200`.
- [auto] When admin repeats the current status -> expect `200` without a status change.
- [auto] When admin requests a forbidden transition -> expect `409 INVALID_STATUS_TRANSITION`.
- [auto] When a course is archived -> expect database triggers to archive active modules and lessons only; draft descendants stay draft.
- [auto] When a course is reactivated -> expect archived descendants to stay archived and draft descendants to stay draft.
- [auto] When status is missing or invalid -> expect `400 VALIDATION_ERROR`.
- [auto] When ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When an error response is returned -> verify it has no stack trace or database details.

### `DELETE /courses/:id`

Caller: platform `admin` with `curriculum.write`; deletes an unused global course.

- [auto] When admin deletes a course with no related records -> expect `204` and the course no longer exists.
- [auto] When a course is referenced by a module or other record -> expect `409 RESOURCE_IN_USE`; the course remains.
- [auto] When the course ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls, even with curriculum permissions granted -> expect `403 FORBIDDEN`.
- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When an error response is returned -> verify it has no stack trace or database details.

## Course modules

### `POST /courses/:courseId/modules`

Caller: platform `admin` with `curriculum.write`; creates a draft module at the end of the course.

- [auto] When title is valid -> expect `201`, trimmed title, DRAFT status, and position after existing modules.
- [auto] When title is blank, whitespace, too long, or an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When course ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When two creates run concurrently -> expect both `201` responses and distinct ordered positions.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

### `GET /courses/:courseId/modules`

Caller: platform `admin` with `curriculum.read`; lists every module in position order (deliberately not paginated).

- [auto] When course has modules -> expect the complete list ordered by strictly increasing positions.
- [auto] When course has no modules -> expect an empty array.
- [auto] When course ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`.

### `PUT /courses/:courseId/modules/order`

Caller: platform `admin` with `curriculum.write`; replaces the full module order.

- [auto] When IDs are the exact course module set -> expect `200` with the requested order and strictly increasing positions.
- [auto] When IDs omit, add, or duplicate a module, including a nonempty list for an empty course -> expect `400 INVALID_ORDER`.
- [auto] When an empty list is sent for an empty course -> expect `200` with an empty array.
- [auto] When course ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.

### `GET /modules/:id`, `PATCH /modules/:id`, and `PATCH /modules/:id/status`

Caller: platform admin with `curriculum.read` for GET and `curriculum.write` for PATCH.

- [auto] When module exists -> GET returns the module response; title PATCH returns the trimmed title.
- [auto] When title is blank, whitespace, too long, or an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When activating under a DRAFT or ARCHIVED course -> expect `409 PARENT_NOT_ACTIVE`.
- [auto] When a status transition is forbidden -> expect `409 INVALID_STATUS_TRANSITION`; database triggers archive active lessons when a module is archived.
- [auto] When module ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

### `DELETE /modules/:id`

Caller: platform `admin` with `curriculum.write`; deletes a module with no dependent records.

- [auto] When module has no dependent records -> expect `204`; repeating deletion returns `404 NOT_FOUND`.
- [auto] When a lesson or other dependent record references the module -> expect `409 RESOURCE_IN_USE` and preserve module and lesson.
- [auto] After deletion leaves a position gap -> a new module appends after the highest remaining position without renumbering.
- [auto] When module ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

## Lessons

### `POST /modules/:moduleId/lessons`

Caller: platform `admin` with `curriculum.write`; creates a draft lesson appended to the module.

- [auto] When title and optional audience are valid -> expect `201`, trimmed title, DRAFT status, module-derived course ID, and default `TEACHER_ONLY` audience.
- [auto] When title is blank, whitespace, too long, audience is invalid, or an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When module ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When concurrent creates target one module -> expect both `201` responses and distinct positions.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

### `GET /modules/:moduleId/lessons`

Caller: platform `admin` with `curriculum.read`; lists all lessons in position order (deliberately not paginated).

- [auto] When module has lessons -> expect the complete list ordered by strictly increasing positions.
- [auto] When module has no lessons -> expect an empty array.
- [auto] When module ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.

### `PUT /modules/:moduleId/lessons/order`

Caller: platform `admin` with `curriculum.write`; replaces the full lesson order.

- [auto] When IDs are the exact lesson set -> expect `200` with the requested order and strictly increasing positions.
- [auto] When IDs omit, add, or duplicate a lesson -> expect `400 INVALID_ORDER`.
- [auto] When an empty list is sent for a module with no lessons -> expect `200` with an empty array.
- [auto] When module ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.

### `GET /lessons/:id`, `PATCH /lessons/:id`, and `PATCH /lessons/:id/status`

Caller: platform admin with `curriculum.read` for GET and `curriculum.write` for PATCH.

- [auto] When lesson exists -> GET returns only the lesson response fields; PATCH trims title and can change audience.
- [auto] When PATCH body is empty, title is null/blank/too long, audience is null/invalid, or an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When activating under a DRAFT or ARCHIVED module -> expect `409 PARENT_NOT_ACTIVE`.
- [auto] When a forbidden status transition is requested -> expect `409 INVALID_STATUS_TRANSITION`.
- [auto] When module is archived -> expect the database trigger to archive active lessons.
- [auto] When lesson ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

### `GET /lessons/:id/content`

Caller: platform `admin` with `curriculum.read`; reads content regardless of lesson status or
audience. Authentication runs before permission checks; a school role remains forbidden even when
granted `curriculum.read`. A valid unknown lesson returns `404`; a malformed UUID returns `400`.

- [auto] When lesson has no blocks -> expect `{ version: 0, blocks: [], assets: {} }`.
- [auto] When blocks include rich text, accordion, image, video, PDF, and two-column layouts -> expect stored content and top-level blocks in position order; layouts contain two nullable column entries.
- [auto] When one asset is reused in top-level and nested blocks -> expect one asset-summary entry; assets referenced only inside columns are included.
- [auto] When an asset has only a FAILED file, is ARCHIVED, or has a READY file plus a newer UPLOADING replacement -> expect the summary to include its state and choose READY over the replacement.
- [auto] When lesson content version is set to `7` -> expect `version: 7`; the returned blocks pass `validateLessonContent` unchanged.
- [auto] When lesson has 100 blocks and 30 distinct referenced assets -> expect every block ordered and all summaries returned.
- [auto] When response JSON is scanned -> expect no storage keys, playback keys, upload/processing IDs, or signed URLs.
- [auto] When lesson ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`; when teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

### `PUT /lessons/:id/content`

Caller: platform `admin` with `curriculum.write`; replaces the complete lesson content tree. A
school role remains forbidden even when granted `curriculum.write`. The global validation pipe
requires an object with only `expectedVersion` and `blocks`; `expectedVersion` is an integer `>= 0`
and `blocks` is an array. A valid unknown lesson returns `404`; a malformed UUID returns `400`.

- [auto] When a valid tree is saved with the current `expectedVersion` -> expect `200` with the normalized blocks, referenced asset summaries, and incremented version; verify ordered top-level positions and column child ownership in the database.
- [auto] When a read response's blocks are sent back unchanged -> expect `200` and no version increment, even on an identical retry. The no-op check precedes the version check; a stale version conflicts only when the submitted normalized tree changes stored content.
- [auto] When blocks are omitted, reordered, or moved between top level and columns -> expect replace semantics; omitted rows are deleted and re-sent IDs are retained. An empty tree clears content and increments version only if content changed.
- [auto] When changed content has a stale version -> expect `409 VERSION_CONFLICT` with `details.currentVersion`; verify no block or version changes. When expectedVersion is missing, negative, fractional, or a string -> expect `400`.
- [auto] When block structure, rich text, links, IDs, fields, asset references, or cross-lesson block ownership are invalid -> expect `400 INVALID_LESSON_CONTENT` with issue paths and no writes. IDs must be UUIDs, unique across the full tree, and not owned by another lesson.
- [auto] When a referenced asset is missing, has the wrong type, is archived for a new reference, or has no READY file for a new reference -> expect `400 INVALID_LESSON_CONTENT` with the matching issue code and path.
- [auto] When an asset was already referenced by this lesson before it becomes ARCHIVED or loses its READY file -> it may remain in the saved tree; new references still require an ACTIVE asset, matching type, and READY file.
- [auto] When two changed saves race with the same expected version -> expect one `200` and one `409`; when identical requests race -> expect both `200` with one version increment.
- [auto] When a JSON body below 1 MB is valid -> expect `200`; when the body exceeds the 1 MB JSON parser limit -> expect `413 PAYLOAD_TOO_LARGE` in the standard error envelope.
- [auto] When a save fails during child insertion -> expect the old blocks and version to remain intact. An asset referenced by saved content cannot be deleted (`409 RESOURCE_IN_USE`) until a later save removes that reference.
- [auto] When validation or persistence fails -> expect the transaction to leave both block rows and `content_version` unchanged; errors use `{ statusCode, code, message, requestId }` with optional `details`, and responses never expose storage keys, playback keys, upload/processing IDs, or password hashes.
- [auto] When lesson status or audience is DRAFT, ACTIVE, ARCHIVED, TEACHER_ONLY, or STUDENT -> expect save to work without changing lesson metadata. Teacher, school staff, and student callers receive `403` even with the route permission; unauthenticated callers receive `401`.

Block shapes, the TipTap whitelist, per-document limits (100 blocks, 50,000 text characters,
5,000 rich-text nodes, depth 20, and 50 issues), and validation issue codes are specified in
[lesson-content.md](./lesson-content.md). Saves are whole-lesson replacements in one transaction;
there is no per-block endpoint or content history.

### `DELETE /lessons/:id`

Caller: platform `admin` with `curriculum.write`; deletes a lesson with no dependent records.

- [auto] When lesson has no dependents -> expect `204`; repeating deletion returns `404 NOT_FOUND`.
- [auto] When a lesson block or other dependent record exists -> expect `409 RESOURCE_IN_USE` and preserve lesson and dependent.
- [auto] After deletion leaves a position gap -> a new lesson appends after the highest remaining position without renumbering.
- [auto] When lesson ID is malformed -> expect `400 BAD_REQUEST`; when valid but unknown -> expect `404 NOT_FOUND`.
- [auto] When teacher/school staff or student calls -> expect `403 FORBIDDEN`; without a session cookie -> expect `401 UNAUTHORIZED`.

## Assets

### `GET /assets`

Caller: authenticated role with `asset.read`; lists ACTIVE assets by default and ARCHIVED assets on request, regardless of file state.

- [auto] When no query is supplied -> expect page 1, limit 20, ACTIVE assets with or without files.
- [auto] Each item includes the READY file when one exists, otherwise the most recent file; when there are no files, `file` is null. The summary includes file ID, status, last error, size, MIME, and original filename.
- [auto] When `fileStatus` is supplied -> include assets with at least one file in that status (READY, FAILED, UPLOADING, UPLOADED, or PROCESSING); the file summary still prefers READY over other files. A FAILED filter can therefore include an asset whose summary file is READY.
- [auto] When `status=ARCHIVED` -> return archived assets regardless of file state; DRAFT and unknown status values -> expect `400`.
- [auto] When type is supplied -> return only matching asset types; invalid types -> expect `400`.
- [auto] When search has surrounding spaces, partial text, or different casing -> trim and match asset titles case-insensitively.
- [auto] When search contains `%` or `_` -> treat those characters literally.
- [auto] When status, type, and search are combined -> apply all filters to both returned items and `total`.
- [auto] When pagination is omitted -> expect page 1 and limit 20; when page is beyond the last page -> expect empty items and matching total; limits above 100 and search longer than 100 characters -> expect `400`.
- [auto] When assets share a `createdAt` value -> order by descending ID after descending creation time.
- [auto] Each item has only asset identity/type/title/status/timestamps and a safe file summary; no usage or internal storage fields.
- [auto] When caller is unauthenticated -> expect `401`; roles without `asset.read` -> expect `403`.

### `GET /assets/:id`

Caller: authenticated role with `asset.read`; returns any asset by ID and its current file plus distinct lesson usage.

- [auto] When a READY file exists -> return it even when a newer replacement is UPLOADING.
- [auto] When no READY file exists -> return the most recently created file (ID descending breaks timestamp ties), including FAILED status and its stable `lastError` code; when the asset has no files -> return `file: null`.
- [auto] When an archived asset is requested -> return it; assets without READY files remain directly inspectable.
- [auto] When one lesson references the asset in multiple top-level or nested two-column blocks -> list that lesson once.
- [auto] When usage spans courses -> order by course title, module position, then lesson position; include DRAFT and ARCHIVED lesson statuses.
- [auto] When the asset is used by more than 50 lessons -> return 50 ordered items and the real total; unused assets have total zero and an empty items list.
- [auto] When the ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] File response contains lifecycle details and stable error code only; no storage, playback, upload, or processing-job keys/IDs.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

### `GET /assets/:id/access`

Caller: authenticated platform staff with `asset.read`; the service also requires `PLATFORM_STAFF`
identity even if another role is later granted the permission. Returns a short-lived inline URL for
the asset's READY file.

- [auto] When the READY file is IMAGE, PDF, or VIDEO -> expect `200` with only `url`, `expiresAt`, `type`, and `mimeType`; `Cache-Control` is `no-store`.
- [auto] Expiry is approximately the configured type TTL from the current time (defaults: image 600 seconds, PDF 1800 seconds, video 7200 seconds; maximum 43,200 seconds).
- [auto] When a VIDEO file has a `playbackKey` -> sign it; otherwise sign `storageKey`.
- [auto] When no files exist or only FAILED, UPLOADING, UPLOADED, or PROCESSING files exist -> expect `409 ASSET_NOT_READY`; a READY file remains served while a newer UPLOADING replacement exists.
- [auto] When the asset is ARCHIVED and has a READY file -> expect `200`.
- [auto] When the ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`, including at the service boundary if they are granted `asset.read`.
- [manual] Request a fresh access URL when a fetch returns `403`; verify the signed object returns the expected content type, inline filename, and supports byte ranges for images, PDFs, and video.

### `POST /assets`

Caller: authenticated admin with `asset.write`; creates an ACTIVE asset and UPLOADING file in one database transaction, then returns upload instructions.

- [auto] When type is IMAGE with `image/jpeg`, `image/png`, or `image/webp`; PDF with `application/pdf`; or VIDEO with `video/mp4` -> expect `201`, persisted asset/file rows, and a PUT URL with required headers.
- [auto] When title has surrounding whitespace -> expect it trimmed; when filename includes control characters -> expect them removed before storing as `originalFilename`.
- [auto] When MIME is padded or uppercase -> expect normalized lowercase MIME to be stored.
- [auto] When type is PPTX or otherwise unsupported -> expect `400 ASSET_TYPE_NOT_SUPPORTED`.
- [auto] When MIME is not allowed for the type or includes parameters -> expect `400 MIME_NOT_ALLOWED`.
- [auto] When declared size is 1-15 bytes -> expect `400 FILE_TOO_SMALL`; signature verification requires a 16-byte sample.
- [auto] When declared size exceeds the configured type limit -> expect `400 FILE_TOO_LARGE`; exactly the limit is allowed by unit tests.
- [auto] When size is zero, negative, fractional, or title/filename is empty or whitespace -> expect `400`.
- [auto] When the body includes an unknown field -> expect `400 VALIDATION_ERROR`.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.
- [manual] Upload using the returned URL, method, and headers; confirm the object uses the exact declared content type and size.

### `POST /assets/:id/files`

Caller: authenticated admin with `asset.write`; prepares a replacement or retry upload for the
existing asset, retaining the asset ID. The body contains `filename`, `mimeType`, and `sizeBytes`;
the asset's existing type selects the MIME allow-list and size limit.

- [auto] When the asset is IMAGE, PDF, or VIDEO and the MIME/size fit that type -> expect `201` with the same `{ asset, file, upload }` shape as `POST /assets`.
- [auto] When a READY file exists -> keep it serving during upload; completing a valid replacement deletes its row and queues exactly its prefix for asynchronous cleanup.
- [auto] When a replacement fails verification -> keep the old READY row serving and do not queue its prefix.
- [auto] When any file is UPLOADED or PROCESSING -> expect `409 REPLACEMENT_IN_PROGRESS` without deleting or creating file rows.
- [auto] When older UPLOADING or FAILED attempts exist -> delete them, queue their prefixes, and retain only the new non-READY attempt; completing a superseded file ID returns `404`.
- [auto] When no READY file exists after a failed or abandoned first upload -> allow the same route as a retry; a successful completion makes the asset appear in `GET /assets`.
- [auto] When two replacement requests race -> expect both `201`, no server error, one remaining non-READY row, and one cleanup entry for the superseded attempt.
- [auto] When MIME is disallowed or size exceeds the asset-type limit -> expect `400 MIME_NOT_ALLOWED` or `400 FILE_TOO_LARGE`; zero, negative, fractional, empty filename, or unknown fields -> expect `400`.
- [auto] When filename contains control characters -> expect them removed before persistence; MIME is trimmed and lowercased.
- [auto] When the asset ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404`; archived assets remain replaceable.
- [auto] Replacing and completing a file does not alter lesson-block asset IDs or where-used results.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

### `PATCH /assets/:id`

Caller: authenticated admin with `asset.write`; renames an asset whether ACTIVE or ARCHIVED.

- [auto] When title has surrounding whitespace -> expect `200` and a trimmed title in the response, detail route, and library list.
- [auto] When title is empty, whitespace-only, or longer than 200 characters -> expect `400`.
- [auto] When the body includes an unknown field -> expect `400 VALIDATION_ERROR`.
- [auto] When the ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

### `PATCH /assets/:id/status`

Caller: authenticated admin with `asset.write`; sets status directly to ACTIVE or ARCHIVED.

- [auto] When status changes to ARCHIVED -> expect `200`; the asset disappears from the default library, but remains available by detail and preview access.
- [auto] When status changes back to ACTIVE -> expect `200` and the asset returns to the default library.
- [auto] When status is unchanged -> expect `200` without changing `updatedAt`.
- [auto] When status is DRAFT or any unknown value -> expect `400`; when ID is malformed -> expect `400 BAD_REQUEST`; when it is a valid unknown UUID -> expect `404 NOT_FOUND`.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

### `DELETE /assets/:id`

Caller: authenticated admin with `asset.write`; deletes an asset only when it is not referenced by lesson blocks and has no UPLOADED or PROCESSING file.

- [auto] When the asset is unused -> expect `204`; all file rows are deleted and each file prefix is queued for asynchronous storage cleanup.
- [auto] When a lesson block references the asset, including a child block inside a TWO_COLUMN block -> expect `409 RESOURCE_IN_USE`; file rows and cleanup queue remain unchanged.
- [auto] After removing the lesson block -> expect deletion to succeed.
- [auto] When any file is UPLOADED or PROCESSING -> expect `409 REPLACEMENT_IN_PROGRESS` without deleting files or changing the cleanup queue.
- [auto] READY, UPLOADING, and FAILED files are eligible for deletion; archived assets and assets without files are also deletable.
- [auto] Repeating deletion or using a valid unknown UUID -> expect `404 NOT_FOUND`; a malformed ID -> expect `400 BAD_REQUEST`.
- [auto] After deletion, detail and access return `404`, and the asset is absent from the library.
- [auto] When deletion races with starting a replacement -> expect no 5xx and either the asset is gone with no files or exists with exactly one UPLOADING file.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

### `GET /assets/:id/files/:fileId`

Caller: authenticated admin with `asset.read`; returns the state of a file belonging to that asset.

- [auto] When asset and file IDs match a row -> expect `200` with status, original filename, MIME, numeric size, error code, and timestamps.
- [auto] When file belongs to another asset or either valid UUID is unknown -> expect `404 NOT_FOUND`; when either ID is malformed -> expect `400 BAD_REQUEST`.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

### `POST /assets/:id/files/:fileId/complete`

Caller: authenticated admin with `asset.write`; verifies the object uploaded to the previously returned storage key.

- [auto] When called while the object is not in storage -> expect `409 UPLOAD_NOT_COMPLETE`, leave status `UPLOADING`, then succeed after the upload is present.
- [auto] When HEAD size differs from the declared size -> expect `200` with status `FAILED` and `lastError: SIZE_MISMATCH`.
- [auto] When HEAD content type does not match the declared MIME (ignoring case, whitespace, and parameters) -> expect `200 FAILED` with `lastError: TYPE_MISMATCH`.
- [auto] When file signature does not match the declared MIME, including PNG-as-JPEG, text-as-PDF, MOV, or HEIC -> expect `200 FAILED` with `lastError: CONTENT_NOT_RECOGNIZED`.
- [auto] When image, PDF, or MP4 signature and HEAD metadata match -> expect `200 READY`; video playback key equals its original storage key, while image/PDF playback keys are null.
- [auto] When a supported processor throws -> expect `200 FAILED` with `lastError: PROCESSING_FAILED`; response and stored error contain no provider error text.
- [auto] When completion is repeated for READY or FAILED files -> expect `200` and the unchanged file state.
- [auto] When two completion requests race -> expect both `200`, one processor execution, and one final READY file.
- [auto] When file does not belong to the supplied asset or either valid UUID is unknown -> expect `404 NOT_FOUND`; when either ID is malformed -> expect `400 BAD_REQUEST`.
- [auto] When caller is unauthenticated -> expect `401`; teacher, student, and school staff -> expect `403`.

## Schools

### `POST /schools`

Caller: platform staff with `school.manage`; creates a school. Non-platform user types are rejected even if granted the permission.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin sends valid fields -> expect `201`; school code is trimmed and uppercased.
- [auto] When code already exists, including case-only difference -> expect `409 SCHOOL_CODE_EXISTS`.
- [auto] When code is malformed or too long -> expect `400 VALIDATION_ERROR`.
- [auto] When required text is blank or contact email is invalid -> expect `400 VALIDATION_ERROR`.
- [auto] When optional address/contact fields are null -> expect `201`; the fields remain null.
- [auto] When optional text is whitespace-only -> expect `400 VALIDATION_ERROR` after trimming.
- [auto] When an unknown body field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When teacher or student calls the route without permission -> expect `403 FORBIDDEN`.
- [auto] When an otherwise permitted non-platform caller is used -> expect `403 FORBIDDEN` from the service's platform-staff check.
- [auto] When allowed Origin is missing -> expect `403 ORIGIN_NOT_ALLOWED`.
- [auto] When code is at the 2- or 12-character boundary, or another required/optional field is exactly at its length limit -> expect `201`.
- [auto] When the same create request is retried -> expect the duplicate code to conflict; there is no idempotency-key behavior.

### `GET /schools`

Caller: authenticated role with `school.read`; lists schools in caller scope with optional status and search.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin lists without filters -> expect all schools in default pagination.
- [auto] When teacher has an explicit `school.read` grant -> expect only their own school.
- [auto] When student or ungranted teacher calls -> expect `403 FORBIDDEN`.
- [auto] When `status` and `q` filters are combined -> expect rows matching both filters.
- [auto] When `q` is partial and differently cased -> expect case-insensitive name/code matching.
- [auto] When names tie -> expect stable ordering by school name then ID.
- [auto] When each optional filter is used alone -> expect only matching rows.
- [auto] When page and limit are omitted -> expect page 1 and limit 20.
- [auto] When limit is 0, negative, non-integer, or over 100, or page is over 100000 -> expect `400 VALIDATION_ERROR`.
- [auto] When page is beyond the final page -> expect an empty `items` list and total count for the matching filter.
- [auto] When no records match -> expect an empty page with total zero.

### `GET /schools/:id`

Caller: authenticated role with `school.read`; reads a school only within caller scope.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin requests an existing school -> expect `200`.
- [auto] When teacher has `school.read` and requests own school -> expect `200`.
- [auto] When teacher requests another school's ID or a random UUID -> expect the same `404 NOT_FOUND`.
- [auto] When student or ungranted teacher calls -> expect `403 FORBIDDEN`.
- [auto] When path ID is not a UUID -> expect `400 BAD_REQUEST`.
- [auto] When an error is returned -> verify it includes `requestId` and no stack trace or database detail.

### `PATCH /schools/:id`

Caller: authenticated role with `school.manage`; changes school details but not code or status.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin updates valid fields -> expect `200`.
- [auto] When a school manager updates its own school -> expect `200`; a foreign school ID returns `404 NOT_FOUND`.
- [auto] When optional nullable fields are set to null -> expect `200` and cleared values.
- [auto] When body is empty or required text is null -> expect `400 VALIDATION_ERROR`.
- [auto] When body includes immutable `code` or unknown field -> expect `400 VALIDATION_ERROR`.
- [auto] When teacher or student calls without permission -> expect `403 FORBIDDEN`.
- [auto] When ID is foreign to a scoped school caller -> expect `404 NOT_FOUND` if caller has the route permission.
- [auto] When path ID is invalid -> expect `400 BAD_REQUEST`.
- [auto] When a field exceeds its DTO length or has the wrong type -> expect `400 VALIDATION_ERROR`.
- [auto] When valid name/contact text has surrounding whitespace -> expect trimming; contact email is lowercased.
- [auto] When the same values are submitted -> expect a successful update; this route does not implement a same-value shortcut.

### `PATCH /schools/:id/status`

Caller: authenticated role with `school.manage`; activates or deactivates a school.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin changes status -> expect `200`.
- [auto] When a school manager changes its own school's status -> expect `200`; foreign and missing IDs return `404 NOT_FOUND`.
- [auto] When admin repeats the current status -> expect `200` with no status change.
- [auto] When status is padded with spaces -> expect trimming and valid enum handling.
- [auto] When status is absent, null, wrong type, or not an enum value -> expect `400 VALIDATION_ERROR`.
- [auto] When school becomes inactive -> expect its school users' next request and login to return `401 UNAUTHORIZED`.
- [auto] When school is reactivated -> expect its users to log in again.
- [auto] When teacher or student calls without permission -> expect `403 FORBIDDEN`.
- [auto] When ID is invalid -> expect `400 BAD_REQUEST`; when foreign or missing -> expect `404 NOT_FOUND`.

## Class sections

### `POST /class-sections`

Caller: authenticated role with `classsection.manage`; creates a class section in one active school.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin supplies school and class name without section name -> expect `201` and default section name `All`.
- [auto] When a teacher with explicit manage permission creates in its own school -> expect `201`; a foreign school ID returns `404 NOT_FOUND`.
- [auto] When section name is supplied with surrounding whitespace -> expect trimming and `201`.
- [auto] When school ID is omitted -> expect `400 SCHOOL_REQUIRED`.
- [auto] When school does not exist -> expect `404 NOT_FOUND`.
- [auto] When school is inactive -> expect `409 SCHOOL_INACTIVE`.
- [auto] When class and section names duplicate case-insensitively in the same school -> expect `409 CLASS_SECTION_EXISTS`.
- [auto] When same names are used in another school -> expect success.
- [auto] When class or section name is blank, null (section), or over 50 characters -> expect `400 VALIDATION_ERROR`.
- [auto] When an unknown field is supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When name is non-string, missing, or exactly at the maximum -> expect validation failure or acceptance at the documented boundary.
- [auto] When student or teacher lacks permission -> expect `403 FORBIDDEN`.
- [auto] When platform staff omits school ID or uses a malformed UUID -> expect `400` (`SCHOOL_REQUIRED` or `VALIDATION_ERROR`).

### `GET /class-sections`

Caller: authenticated role with `classsection.read`; lists sections within resolved school scope.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin lists without school filter -> expect sections across schools.
- [auto] When admin supplies `schoolId` -> expect only that school's sections.
- [auto] When teacher is granted `classsection.read` -> expect own-school sections.
- [auto] When teacher supplies another `schoolId` -> expect `404 NOT_FOUND`.
- [auto] When student or ungranted teacher calls -> expect `403 FORBIDDEN`.
- [auto] When partial, differently cased `q` is supplied -> expect matching class or section names.
- [auto] When pagination is used -> expect stable ordering and page metadata.
- [auto] When page/limit are omitted -> expect defaults page 1 and limit 20.
- [auto] When limit is over 100, page over 100000, malformed UUID, or `q` over 100 characters -> expect `400 VALIDATION_ERROR`.
- [auto] When page is beyond the end or no filter matches -> expect an empty item list and correct total.
- [auto] When filters are tested one at a time and together -> expect their intersection.

### `GET /class-sections/:id`

Caller: authenticated role with `classsection.read`; reads one section only in caller scope.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin requests an existing section in either school -> expect `200`.
- [auto] When teacher with read permission requests own-school section -> expect `200`.
- [auto] When teacher requests foreign section or missing UUID -> expect the same `404 NOT_FOUND`.
- [auto] When student or ungranted caller calls -> expect `403 FORBIDDEN`.
- [auto] When path ID is not a UUID -> expect `400 BAD_REQUEST`.

### `PATCH /class-sections/:id`

Caller: authenticated role with `classsection.manage`; changes class or section names within caller scope.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin changes a name -> expect `200`.
- [auto] When update body is empty or a name is null -> expect `400 VALIDATION_ERROR`.
- [auto] When update creates a case-insensitive duplicate -> expect `409 CLASS_SECTION_EXISTS`.
- [auto] When only letter case changes and no other row conflicts -> expect `200`.
- [auto] When teacher has manage permission and changes a foreign section -> expect `404 NOT_FOUND` and no data change.
- [auto] When student or ungranted caller calls -> expect `403 FORBIDDEN`.
- [auto] When caller sends schoolId or another unknown property -> expect `400 VALIDATION_ERROR`.
- [auto] When ID is malformed -> expect `400 BAD_REQUEST`; when record is missing -> expect `404 NOT_FOUND`.
- [auto] When same name values are sent -> expect `200`; there is no explicit no-op shortcut.

### `DELETE /class-sections/:id`

Caller: authenticated role with `classsection.manage`; deletes a section with no referencing student profile.

- [auto] When no session cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin deletes an unused section -> expect `204`.
- [auto] When a student profile references the section -> expect `409 RESOURCE_IN_USE`.
- [auto] When section does not exist -> expect `404 NOT_FOUND`.
- [auto] When teacher with manage permission targets a foreign section or missing ID -> expect same `404 NOT_FOUND`.
- [auto] When student or ungranted caller calls -> expect `403 FORBIDDEN`.
- [auto] When ID is not a UUID -> expect `400 BAD_REQUEST`.

## Users

All current `role_permissions` grants belong to admin. The E2E suite adds selected teacher grants
before starting its app to test scope and visibility; those grants are not the default deployment
state.

### `POST /users/teachers`

Caller: authenticated role with `user.create.teacher`; creates an active-school staff account and teacher profile.

- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin provides valid school, name, and password -> expect `201`, generated SteamX ID, and teacher profile created atomically.
- [auto] When fields include padded name, email, or assignment -> expect trimming; email is lowercased.
- [auto] When teacher is explicitly granted `user.create.teacher` -> expect creation in their own school.
- [auto] When a school caller targets a foreign school -> expect `404 NOT_FOUND`.
- [auto] When generated SteamX IDs use short, single, honorific, or non-Latin names -> expect a valid school-prefixed ID.
- [auto] When generated SteamX ID collides -> expect retry; the rejected ID is not returned.
- [auto] When account is created -> expect initial password login and `mustChangePassword: true`.
- [auto] When school ID is omitted -> expect `400 SCHOOL_REQUIRED`.
- [auto] When school ID is unknown or belongs to another school caller -> expect `404 NOT_FOUND`.
- [auto] When school is inactive -> expect `409 SCHOOL_INACTIVE`.
- [auto] When SteamX ID collides once -> expect retry and successful creation with the next candidate.
- [auto] When SteamX ID collides three times -> expect `409 STEAMX_ID_UNAVAILABLE`.
- [auto] When email duplicates an existing user -> expect `409 CONFLICT`.
- [auto] When required field missing/blank, email invalid, unknown field supplied, or field length/type invalid -> expect `400 VALIDATION_ERROR`.
- [auto] When password is missing, non-string, or over 100 characters -> expect `400 VALIDATION_ERROR`; when too short or padded with whitespace -> expect `400 PASSWORD_POLICY`.
- [auto] When response is returned -> expect no `passwordHash`.
- [auto] When either teacher or student profile insertion fails -> expect the user insert to roll back.
- [manual] When the same successful request is retried without a unique email -> a second account may be created; this route has no idempotency key.
- [manual] When Origin is missing or unlisted -> expect `403 ORIGIN_NOT_ALLOWED`.

### `POST /users/students`

Caller: authenticated role with `user.create.student`; creates an active-school student and required profile.

- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When admin supplies school, valid class section, name, and password -> expect `201` and student profile created atomically.
- [auto] When guardian name is padded -> expect trimming.
- [auto] When student body contains an email field -> expect `400 VALIDATION_ERROR` because email is not accepted.
- [auto] When class section belongs to a different school than requested -> expect `404 NOT_FOUND`.
- [auto] When teacher or student calls without `user.create.student` -> expect `403 FORBIDDEN`.
- [auto] When school is omitted -> expect `400 SCHOOL_REQUIRED`; when unknown -> expect `404`; when inactive -> expect `409 SCHOOL_INACTIVE`.
- [auto] When class section ID is invalid UUID -> expect `400 VALIDATION_ERROR`; when nonexistent or foreign -> expect `404 NOT_FOUND`.
- [auto] When name/password is missing, invalid, over limit, or unknown fields are supplied -> expect `400 VALIDATION_ERROR` or `400 PASSWORD_POLICY` for policy failures.
- [auto] When email is supplied for a student -> expect `400 VALIDATION_ERROR`.
- [auto] When student profile insertion fails -> expect the user insert to roll back.
- [auto] When response is returned -> expect no `passwordHash` and `mustChangePassword` true.
- [manual] When repeated without a unique field such as email -> a second student may be created; the route has no idempotency key.

### `GET /users`

Caller: authenticated role with `user.read`; returns filtered and paginated users after school scope and user visibility.

- [auto] When admin lists with school, role, status, and search filters -> expect matching paginated results.
- [auto] When search matches a partial email -> expect the matching user.
- [auto] When pages split equal-created-time users -> expect stable ID tie-breaking.
- [auto] When school staff is given `user.read` -> expect only their own user in the list.
- [auto] When that school staff member requests another school's filter -> expect `404 NOT_FOUND`.
- [auto] When a student without `user.read` calls -> expect `403 FORBIDDEN` with a permission-related message.
- [manual] When an ungranted teacher calls -> expect `403 FORBIDDEN`.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When role, status, school, or search is used alone -> expect only rows matching that filter.
- [auto] When filters are combined -> expect their intersection.
- [auto] When search uses mixed case -> expect case-insensitive partial matches in name, SteamX ID, or email.
- [auto] When defaults are omitted -> expect page 1 and limit 20; limit max is 100 and page max is 100000.
- [auto] When page exceeds results -> expect empty items and a matching total; when there are no matches -> total zero.
- [auto] When query UUID, enum, role, page, or limit is invalid -> expect `400 VALIDATION_ERROR`.
- [auto] When list results are returned -> expect no `passwordHash`.

### `GET /users/:id`

Caller: authenticated role with `user.read`; returns a user only if both school scope and visibility allow it.

- [auto] When admin requests a user in either school -> expect `200`.
- [auto] When teacher with `user.read` requests their own user -> expect `200`.
- [auto] When a school caller requests a foreign or otherwise invisible user -> expect `404 NOT_FOUND`, not `403`.
- [auto] When user ID is a random UUID -> expect same not-found response as an invisible ID.
- [auto] When a student without `user.read` calls -> expect `403 FORBIDDEN`.
- [manual] When an ungranted teacher calls -> expect `403 FORBIDDEN`.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When ID is not a UUID -> expect `400 BAD_REQUEST`.
- [auto] When response is returned -> expect no `passwordHash`.

### `PATCH /users/:id`

Caller: authenticated role with `user.update`; updates only fields valid for the target account type.

- [auto] When admin updates teacher name/email/primary assignment -> expect `200`, trimmed fields, and lowercase email.
- [auto] When admin updates student class within same school -> expect `200` and new current class.
- [auto] When target is a student and email or primary assignment is supplied -> expect `400 FIELD_NOT_APPLICABLE`.
- [auto] When target is a teacher and guardian/class fields are supplied -> expect `400 FIELD_NOT_APPLICABLE`.
- [auto] When body is empty -> expect `400 VALIDATION_ERROR`.
- [auto] When email duplicates another user -> expect `409 CONFLICT`.
- [auto] When student class section belongs to another school -> expect `404 NOT_FOUND` and unchanged profile.
- [auto] When admin targets platform-staff account -> expect `400 USER_NOT_MANAGEABLE`.
- [auto] When school staff targets a foreign account -> expect `404 NOT_FOUND`.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When target is missing or invisible -> expect `404 NOT_FOUND`.
- [auto] When optional nullable profile fields are set to null -> they are accepted when that field applies; null classSectionId/name is invalid.
- [auto] When field is unknown, wrong type, too long, or whitespace-only where non-empty is required -> expect `400 VALIDATION_ERROR`.
- [auto] When user repeats current values -> expect successful response without changing values.
- [manual] After changing a student's class -> verify old-class enrollment status; the service currently has a TODO and does not update enrollment state.
- [auto] When response is returned -> expect no `passwordHash`.

### `PATCH /users/:id/status`

Caller: authenticated role with `user.deactivate`; changes status of another manageable school user.

- [auto] When admin changes active user to inactive -> expect `200`.
- [auto] When target's cookie is reused immediately -> expect `401 UNAUTHORIZED` on next protected request and login.
- [auto] When admin reactivates target -> expect `200` and the existing token works again if not otherwise revoked.
- [auto] When admin repeats current status -> expect `200`.
- [auto] When caller targets own ID -> expect `400 CANNOT_DEACTIVATE_SELF`.
- [auto] When target is platform staff -> expect `400 USER_NOT_MANAGEABLE`.
- [auto] When school staff targets a foreign user -> expect `404 NOT_FOUND`.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When status is absent, null, invalid enum, or unknown fields supplied -> expect `400 VALIDATION_ERROR`.
- [auto] When student calls -> expect `403 FORBIDDEN`.
- [auto] When ID is malformed -> expect `400 BAD_REQUEST`; when missing/invisible -> expect `404 NOT_FOUND`.

### `PATCH /users/:id/steamx-id`

Caller: authenticated role with `user.steamx-id.update`; changes an eligible school user's login ID.

- [auto] When admin supplies lowercased/padded, valid ID with target school's prefix -> expect `200` and normalized ID.
- [auto] When prefix is wrong or name/digit format is invalid -> expect `400 INVALID_STEAMX_ID`.
- [auto] When new ID is already used -> expect `409 STEAMX_ID_TAKEN`.
- [auto] When target is platform staff -> expect `400 STEAMX_ID_NOT_RENAMABLE`.
- [auto] When teacher targets foreign user -> expect `404 NOT_FOUND`.
- [auto] When student lacks permission -> expect `403 FORBIDDEN`.
- [auto] When login uses old ID after rename -> expect `401`; new ID login succeeds.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto] When target ID is malformed -> expect `400 BAD_REQUEST`; missing or invisible target -> expect `404 NOT_FOUND`.
- [auto] When DTO value is empty or over 32 characters -> expect `400 VALIDATION_ERROR`.
- [auto] When the same current ID is submitted -> expect `200` with no database rename.
- [auto] When a current session cookie is used after rename -> it remains valid; tokens identify immutable user UUID, not SteamX ID.

### `POST /users/:id/reset-password`

Caller: authenticated role with `user.password.reset`; resets another visible user's password and requires a password change.

- [auto] When admin resets a school user's password -> expect `204`.
- [auto] When target's old cookie is used after reset -> expect `401 UNAUTHORIZED`.
- [auto] When target logs in with new password -> expect success and forced password change.
- [auto] When target logs in with old password -> expect `401 UNAUTHORIZED`.
- [auto] When admin resets own password -> expect `400 CANNOT_RESET_OWN_PASSWORD`.
- [auto] When reset password violates policy -> expect `400 PASSWORD_POLICY`.
- [auto] When a student without `user.password.reset` calls -> expect `403 FORBIDDEN`.
- [auto] When school staff has a custom reset grant but targets another user -> current self-only visibility returns `404`; targeting self is rejected with `400 CANNOT_RESET_OWN_PASSWORD`.
- [auto] When no cookie is sent -> expect `401 UNAUTHORIZED`.
- [auto: known-failing] When target is another platform-staff account -> expect `400 USER_NOT_MANAGEABLE`; the service currently permits this reset.
- [auto] When ID is malformed -> expect `400 BAD_REQUEST`; missing or invisible target -> expect `404 NOT_FOUND`.
- [manual] When reset is repeatedly submitted -> there is no request rate limiter or idempotency key; an accepted reset invalidates prior tokens.

## Health

### `GET /health/live`

Caller: public; confirms the process is responding without checking database readiness.

- [auto] When called without cookie or Origin -> expect `200`.
- [auto] When called at `/api/v1/health/live` -> expect `404`; this route is unversioned and outside the API prefix.

### `GET /health/ready`

Caller: public; checks PostgreSQL readiness.

- [auto] When database check succeeds -> expect `200`.
- [auto] When the readiness query fails -> expect `503` with no database connection details in the response.
- [auto] When called under `/api/v1` -> expect `404`.

## Shared validation and safety checks

- [auto] When nested DTO contains wrong type or unknown field -> expect `400 VALIDATION_ERROR` with nested field paths.
- [auto] When request ID is a UUID -> expect it echoed in `X-Request-Id` and the error envelope.
- [auto] When request ID is invalid -> expect a generated UUID.
- [manual] For every API error -> verify `statusCode`, `code`, `message`, and `requestId`; verify no stack trace, SQL, internal column, or constraint name is exposed.
- [manual] For every successful user response/list -> verify password hashes and unselected internal fields are absent.
- [auto] For user success and error responses exercised by e2e tests -> verify no `passwordHash` is returned.
- [manual] For every state-changing operation -> test an allowed, missing, `null`, malformed, and unlisted Origin where applicable.

## Database rules that bypassing the API must not bypass

- [auto: DB] When a SteamX ID is lowercase, padded, malformed, or outside the database length/format -> expect the `users_steamx_id_fmt` check to reject it.
- [auto: DB] When school code is malformed/lowercase, school name/city is blank, or contact email is uppercase/padded -> expect the matching school check to reject it.
- [auto: DB] When platform staff has a school or school staff has none -> expect `users_school_scope` to reject the row.
- [auto: DB] When student has email, email is uppercase/padded, or name is blank -> expect the matching user check to reject the row.
- [auto: DB] When student/teacher profile user type does not match its table -> expect the profile type check to reject it.
- [auto: DB] When student or role `teacher` user is committed without its required profile -> expect the deferred trigger to reject the transaction and roll it back.
- [auto: DB] When class/section names are blank or have surrounding whitespace -> expect `class_sections_names_ok` to reject them.
- [auto: DB] When class and section differ only by case in one school -> expect the expression unique index to reject the duplicate; the same names in another school are allowed.
- [auto: DB] When role key, school code, class-section school ID, or user identity/scope is changed -> expect its immutability trigger to reject it.
- [auto: DB] When SteamX ID changes outside the controlled transaction-local setting -> expect the trigger to reject it.
- [auto] When teacher or student profile insertion fails midway -> verify the user insert rolls back with the profile.
- [manual] When a rename operation fails midway -> verify the user ID remains unchanged.
