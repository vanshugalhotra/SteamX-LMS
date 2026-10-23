# Decisions

Each entry records the current design choice and why.

## Infrastructure

- **Staging is S3-only** — no domain yet, so no HTTPS endpoint. ECS/RDS/ALB come after the domain exists.
- **IAM user keys in staging only** — backend isn't on ECS yet. Production will use an ECS task role.

## Identity & auth

- **Single `name` field** — no separate first/last. All creation, display, and SteamX ID generation use one value.
- **JWT cookie + per-request DB check** — the DB lookup makes deactivation instant without a session table (one identity query per protected request).
- **No audit/history table yet** — SteamX ID renames are logged but old IDs aren't stored as queryable history.

## Multi-tenancy

- **Explicit school scope** — passed into queries, not ambient request context. Keeps tenant filters visible and platform-wide access deliberate. See [access-control.md](./access-control.md).
- **404 for foreign resources** — same response for foreign-school and nonexistent IDs. Prevents cross-school existence probes.
- **Fail-closed user visibility** — explicit in queries. Prevents new callers from accidentally inheriting unrestricted access.

## Curriculum

- **Shared status helper** — courses, modules, and lessons use one pure `canTransitionContentStatus` function.
- **No return to DRAFT** — status can never go back to `DRAFT` after leaving it.
- **DRAFT → ARCHIVED allowed** — useful for populated draft content that can't be deleted due to dependents.
- **Course titles not unique** — admins are responsible for avoiding confusing duplicates.
- **Archival + release access** — archiving a parent archives active descendants (not drafts). Restoring a parent does not restore children. Already-released content stays served while subscription is valid. See [database.md](./database.md).
- **Immediate ordering constraints** — Prisma unique constraints on positions. Reordering uses temporary positions to avoid collisions. Two-column children: delete + recreate rather than swap.
- **Full-list reorder** — `PUT .../order` accepts the complete ordered ID list under a parent row lock. Position gaps from deletes are normalized by reorder.
- **Unpaginated nested lists** — module and lesson lists are unpaginated so reorder clients get the complete set.
- **Delete = FK-restricted only** — deletion blocked by foreign keys, using shared `RESOURCE_IN_USE` error code.
- **Outline read model** — `GET /courses/:id/outline` reads across course/module/lesson in one query. Writes stay in their feature folders. Admin-only and unfiltered; teacher/student outlines need separate filtered endpoints.
- **No content version history** — replacements aren't archived versions. Add when revision browsing becomes a requirement.

## Storage

- **Prefix-based asset keys** — `assets/<asset_id>/<asset_file_id>/`. DB checks protect this layout because row deletion queues the whole prefix for cleanup. Key construction is centralized in the application.
- **Asset upload types and MIME allow-list** — IMAGE accepts JPEG/PNG/WEBP, PDF accepts PDF, and VIDEO accepts MP4. PPTX remains in the database enum for existing curriculum content but is rejected during upload validation.
- **Asset keys use IDs only** — original object keys are `assets/<asset_id>/<asset_file_id>/original`; client filenames are retained only as `original_filename`.
- **Asset processor seam** — image/PDF passthrough produces no playback key, and MP4 video is served from its original key. HLS can replace the video processor with asynchronous work tracked by the existing `processing_job_id`.
- **Asset sizes in API responses** — Prisma BigInt `size_bytes` is converted to a JSON number by the asset mapper.
- **Asset processing errors** — `last_error` stores a short stable error code, never provider error text or stack traces.
- **One processing path for each asset type** — every uploaded file moves `UPLOADING → UPLOADED → PROCESSING → READY`; passthrough processors still use PROCESSING so real video transcoding can replace only the processing step.
- **Conditional file transitions provide idempotency** — callers transition only from an expected status. The caller that wins `UPLOADING → UPLOADED` continues; other completion calls re-read the current state. A crash after winning can leave a PROCESSING row for CUR-15 cleanup.
- **Complete response contract** — `POST /assets/:id/files/:fileId/complete` returns `200` with current state, including FAILED, except when storage has no object yet (`409 UPLOAD_NOT_COMPLETE`) so the client can retry.
- **READY file replacement is atomic** — `makeReady` locks the asset row, deletes the old READY row, then conditionally marks the new file READY in one transaction. A failed update rolls back deletion and its cleanup-queue trigger, preserving the current serving file.
- **Upload completion verifies storage metadata and bytes** — HEAD size is checked even though the presigned PUT signs content length; content type and the first 16 bytes are checked before processing. Failures use `SIZE_MISMATCH`, `FILE_TOO_LARGE`, `TYPE_MISMATCH`, `CONTENT_NOT_RECOGNIZED`, `PROCESSING_FAILED`, or `ASSET_TYPE_NOT_SUPPORTED` for legacy unsupported file types.
- **`StorageService` is abstract** — thin S3 boundary with an in-memory test implementation. Not a generic wrapper.
- **Presigned PUT URLs** — sign `content-type`, `content-length`, and `if-none-match` via `signableHeaders`. `If-None-Match: *` prevents overwrites. `content-length` signing prevents size mismatches (verified in Chrome and Firefox).
- **S3 checksum config** — `requestChecksumCalculation` and `responseChecksumValidation` set to `WHEN_REQUIRED` (SDK defaults break presigned browser uploads).
- **No user filenames in keys** — stored in DB only. `deleteByPrefix` requires a UUID second segment. Presigned URLs are never logged.
