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
- **Asset library list visibility** — `GET /assets` hides assets without a READY file and defaults to ACTIVE status; ARCHIVED assets are opt-in.
- **Archived asset library behavior** — archived assets disappear from the default library, remain usable where already referenced, and stay previewable; the block service will refuse to attach archived assets.
- **Asset deletion is FK-guarded and atomic** — delete only when unused; file rows are deleted before the asset in one transaction so a blocked delete rolls back all rows and cleanup entries.
- **Asset deletion respects in-flight uploads** — UPLOADED and PROCESSING files block deletion under the same rule as replacement.
- **Asset storage deletion is asynchronous** — deleting file rows queues their storage prefixes; objects are removed later through the cleanup worker.
- **Asset detail current file** — prefer the READY file; if none exists, use the newest file by `created_at`, breaking ties by ID; return null when no file rows exist.
- **Asset where-used read model** — usage is distinct lessons read across lessons/modules/courses/blocks, ordered by course/module/lesson and capped at 50 items with the real total; repeated block references count a lesson once.

## Storage

- **Prefix-based asset keys** — `assets/<asset_id>/<asset_file_id>/`. DB checks protect this layout because row deletion queues the whole prefix for cleanup. Key construction is centralized in the application.
- **Asset upload types and MIME allow-list** — IMAGE accepts JPEG/PNG/WEBP, PDF accepts PDF, and VIDEO accepts MP4. PPTX remains in the database enum for existing curriculum content but is rejected during upload validation.
- **Asset keys use IDs only** — original object keys are `assets/<asset_id>/<asset_file_id>/original`; client filenames are retained only as `original_filename`.
- **Asset processor seam** — image/PDF passthrough produces no playback key, and MP4 video is served from its original key. HLS can replace the video processor with asynchronous work tracked by the existing `processing_job_id`.
- **Asset sizes in API responses** — Prisma BigInt `size_bytes` is converted to a JSON number by the asset mapper.
- **Minimum upload size** — initialization rejects files smaller than 16 bytes (`FILE_TOO_SMALL`) because signature detection needs the first 16 bytes; these files could never complete successfully.
- **Asset processing errors** — `last_error` stores a short stable error code, never provider error text or stack traces.
- **One processing path for each asset type** — every uploaded file moves `UPLOADING → UPLOADED → PROCESSING → READY`; passthrough processors still use PROCESSING so real video transcoding can replace only the processing step.
- **Conditional file transitions provide idempotency** — callers transition only from an expected status. The caller that wins `UPLOADING → UPLOADED` continues; other completion calls re-read the current state. A crash after winning can leave a PROCESSING row for CUR-15 cleanup.
- **Complete response contract** — `POST /assets/:id/files/:fileId/complete` returns `200` with current state, including FAILED, except when storage has no object yet (`409 UPLOAD_NOT_COMPLETE`) so the client can retry.
- **READY file replacement is atomic** — `makeReady` locks the asset row, deletes the old READY row, then conditionally marks the new file READY in one transaction. A failed update rolls back deletion and its cleanup-queue trigger, preserving the current serving file.
- **Asset replacement retains identity** — replacing the file keeps the asset ID so lesson blocks pick up the new file without block changes.
- **Replacement is also retry** — `POST /assets/:id/files` is used when the initial upload failed or was abandoned and no READY file exists.
- **New attempts supersede unfinished attempts** — a replacement removes older UPLOADING and FAILED rows and queues their prefixes; UPLOADED and PROCESSING are in-flight completion work and return `409 REPLACEMENT_IN_PROGRESS`.
- **Old file cleanup follows the READY swap** — the previous READY row is removed only by `makeReady`; its prefix is cleaned asynchronously through the storage cleanup queue.
- **Upload completion verifies storage metadata and bytes** — HEAD size is checked even though the presigned PUT signs content length; content type and the first 16 bytes are checked before processing. Failures use `SIZE_MISMATCH`, `FILE_TOO_LARGE`, `TYPE_MISMATCH`, `CONTENT_NOT_RECOGNIZED`, `PROCESSING_FAILED`, or `ASSET_TYPE_NOT_SUPPORTED` for legacy unsupported file types.
- **`StorageService` is abstract** — thin S3 boundary with an in-memory test implementation. Not a generic wrapper.
- **Presigned PUT URLs** — sign `content-type`, `content-length`, and `if-none-match` via `signableHeaders`. `If-None-Match: *` prevents overwrites. `content-length` signing prevents size mismatches (verified in Chrome and Firefox).
- **S3 checksum config** — `requestChecksumCalculation` and `responseChecksumValidation` set to `WHEN_REQUIRED` (SDK defaults break presigned browser uploads).
- **No user filenames in keys** — stored in DB only. `deleteByPrefix` requires a UUID second segment. Presigned URLs are never logged.
- **Two-method asset access seam** — author lookup and authorization stay in `issueForAuthor`; signing is centralized in `issueForFile`. Future student callers must complete lesson, delivery, and subscription checks before calling `issueForFile`.
- **Asset access key selection** — sign `playbackKey ?? storageKey`. MP4 uses the same key today; HLS can point `playbackKey` at its manifest without changing the signing method.
- **Asset access URL TTLs** — image defaults to 600 seconds, PDF to 1800, and video to 7200 (maximum 43,200). S3 checks expiry on every request, and viewers/players continue byte-range requests during normal viewing.
- **No-store access responses** — `GET /assets/:id/access` sends `Cache-Control: no-store`; clients request another URL after a fetch returns 403.
- **Archived assets remain previewable** — author access requires a READY file, not ACTIVE content status.
- **Signed asset URLs are never logged** — structured access logs contain only asset, file, and user IDs.
- **Consider checking object existence before signing** — a HEAD request adds S3 latency to each URL issuance and cannot prevent a later deletion; defer unless missing-object reports justify the cost.
- **Self-rescheduling cleanup timer** — schedule the next tick only after the current run finishes and call `unref()`; this is one in-process job, so overlap is impossible without `setInterval` or a scheduling library.
- **No cleanup locks** — every queue and asset cleanup operation is idempotent, so multiple API instances may process entries concurrently.
- **Queue delay protects late uploads** — wait for `UPLOAD_URL_TTL_SECONDS` plus five minutes before deleting a prefix, because a superseded or abandoned upload URL can still receive a late PUT until expiry.
- **Cursor-paged prefix cleanup** — select only pending `is_prefix = true` entries and advance by `(queued_at, id)` cursor so failing entries cannot starve entries behind them. Failed entries retry on each run; there is no attempts column, and alerting must be added before release. `is_prefix = false` entries are skipped until submissions exist.
- **Stale means non-READY and old by `updated_at`** — delete non-READY file rows only after 24 hours without an update; `created_at` is not the activity signal and READY files are never removed by this rule.
- **Remove only ghost assets** — empty assets are deleted when they have no file rows and no lesson-block references; a live upload always has a file row.
