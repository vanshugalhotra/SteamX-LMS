# Decisions

Each item records the current design and the reason it is used.

## Staging infrastructure is S3-only until a domain exists

Staging starts with S3 only. Without a domain there is no HTTPS endpoint, so running ECS and RDS
now would add cost without providing a usable application environment. Add RDS/ECS/ALB once the
domain exists.

## Backend uses IAM user keys in staging only

Use manually created IAM user keys for the staging backend because it is not yet running on ECS.
Production will use an ECS task role instead of long-lived user keys.

## One name field

Store a single `name` value for a user rather than separate first and last names. Current user
creation, display, and SteamX ID generation all consume that one value.

## Explicit school scope

Pass the caller's scope into service and repository queries instead of relying on ambient request
context (see [school scope](./access-control.md#school-scope-and-user-visibility)). This keeps tenant
filters visible and makes platform-wide access deliberate.

## 404 for foreign resources

Return the same not-found response for a foreign-school ID and a nonexistent ID (see
[school scope](./access-control.md#school-scope-and-user-visibility)). This avoids resource
existence probes across schools.

## School-prefixed SteamX IDs

Generated IDs use the school code, a 4–8 letter uppercase name part, and three digits. The
`SteamxIdService` retries up to three times only when the SteamX ID uniqueness constraint collides.
Renames are restricted to school users and pass through a transaction-local database setting that
temporarily permits the immutable ID update.

## Fail-closed user visibility

Keep user visibility explicit in queries (see
[school scope and user visibility](./access-control.md#school-scope-and-user-visibility)). This
prevents new callers from accidentally inheriting unrestricted access.

## JWT cookie with request-time database checks

Use the cookie-backed JWT and per-request database check described in
[Login and sessions](./access-control.md#login-and-sessions). The lookup makes account changes
effective without a session table, at the cost of one identity query per protected request.

## No audit or SteamX ID history table yet

The schema stores the current SteamX ID and operational state, but has no audit log or ID history
table. Renames are logged by the application, but old IDs are not stored as queryable history.

## No content version history

The schema has current asset and file records but no content revision history. A replacement is not
an archived content version; add version history when restore or revision browsing becomes a
product requirement.

## Curriculum archival and release access

Draft content is never student-visible. Active content is usable; archived content cannot be used
for new subscriptions or deliveries, but already-released content continues to be served in existing
deliveries while the subscription is valid. Archiving a course does not alter existing delivery or
release rows; subscription expiry is the access cutoff. Archiving a course or module archives its
active descendants but leaves draft descendants untouched; restoring a parent does not restore any
child. Courses, modules, and lessons may never return to draft after leaving it.

## Immediate curriculum ordering constraints

Use Prisma unique constraints for module, lesson, and block positions/columns. They reject
duplicates immediately; reordering uses unused temporary positions. For the two-column layout,
delete and recreate children rather than swapping their column indexes. This avoids raw deferred
constraints and commit-time uniqueness errors.

## Course module ordering

- **Full-list reorder:** `PUT /courses/:courseId/modules/order` accepts the complete ordered module
  ID list. Under a parent course row lock, park positions before assigning final positions because
  `(course_id, position)` is immediately unique. Evaluate deferred constraints with one set-based
  update only if reorder becomes a measured bottleneck.
- **Position gaps:** deleting a module does not renumber siblings; create appends after the highest
  position and reorder normalizes the list.
- **Nested list pagination:** the course's module list is deliberately unpaginated so reorder clients
  receive the complete ordered set.
- **Module deletion:** allow deletion only when no dependent record references the module; restrictive
  foreign keys are the guard.
- **Delete conflict response:** all foreign-key-restricted deletes use the shared `RESOURCE_IN_USE`
  error code.
- **Lesson deletion:** allow deletion only when no blocks or other dependent records reference it;
  restrictive foreign keys are the guard.

## Curriculum course API

- **Course deletion:** allow deletion only when the course has no dependent records; restrictive
  foreign keys block deletion once content or delivery records reference it.
- **Shared status helper:** courses, modules, and lessons use one pure transition helper.
- **Draft archival:** allow `DRAFT -> ARCHIVED`; this remains useful for populated draft content
  that cannot be deleted because it has dependent records. Content may not transition back to `DRAFT`.
- **Course titles are not unique:** global content titles may be reused, including after archival.
  Admins are responsible for avoiding confusing duplicate active course titles.

## Course outline read model

`GET /courses/:id/outline` is a deliberate read-only exception to curriculum module boundaries: one
repository query reads the course, modules, and lessons together. All writes remain in the courses,
course-modules, and lessons folders. The endpoint is admin-only, unfiltered, and unpaginated; teacher
and student outlines require separate release- and audience-filtered endpoints.

## Prefix-based asset storage keys

Each asset-file object's storage and playback keys live below
`assets/<asset_id>/<asset_file_id>/`. Database checks protect this layout because deleting the row
queues the whole prefix for cleanup. Keep key construction centralized in the application. Asset-file
IDs are generated by Prisma's UUIDv7 client behavior and must be supplied by the inserting client.

IMAGE/PDF files can become READY directly after upload; VIDEO/PPTX files pass through processing.

## Storage boundary

`StorageService` is an abstract class exported by `StorageModule`, with an in-memory implementation
for tests. It is a thin boundary over the external object-storage service, not a generic storage
wrapper.

S3 clients use `requestChecksumCalculation` and `responseChecksumValidation` set to
`WHEN_REQUIRED`: the SDK's default checksum behavior breaks presigned browser uploads. Presigned
PUT signing explicitly includes `content-type`, `content-length`, and `if-none-match` through the
presigner's `signableHeaders` option. `If-None-Match: *` makes S3 reject a second upload to an
existing key, so a presigned upload link cannot overwrite an object after validation.

Presigned PUT URLs keep `content-length` signed. Browser verification on 2026-10-22 in Chrome and
Firefox confirmed that correctly sized uploads succeed and an upload with one extra byte is rejected
with 403 `SignatureDoesNotMatch`. Safari was unavailable for testing.

Storage keys use resource IDs and fixed names only; user-supplied filenames are stored in the
database and never form key segments. `deleteByPrefix` accepts only resource-level prefixes with a
UUID second segment. Presigned URLs are bearer secrets and are never logged. One helper builds all
Content-Disposition values. Content sniffing is range-limited to 4096 bytes, enough for magic-byte
checks.
