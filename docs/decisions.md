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

## Asset library

- **Library visibility and detail** — `GET /assets` lists ACTIVE assets with a READY file by default; ARCHIVED is opt-in. Detail prefers READY, otherwise the newest file, and reports distinct where-used lessons capped at 50 with the full total.
- **Archive and deletion** — archived assets leave the default list but stay inspectable and previewable. No block service exists yet; the database foreign key is the current in-use deletion guard.
- **Replacement lifecycle** — the asset ID remains stable. The old READY file serves until a replacement succeeds; UPLOADED/PROCESSING work blocks new replacement/deletion, while older UPLOADING/FAILED attempts may be superseded.
- **Atomic file swap** — the READY swap is transactional; a failed replacement preserves the serving file. Removed file prefixes are queued for asynchronous cleanup.
- **Upload contract and keys** — IMAGE accepts JPEG/PNG/WEBP, PDF accepts PDF, VIDEO accepts MP4 only; PPTX uploads are rejected. Keys use asset/file IDs under `assets/<asset-id>/<file-id>/`; filenames remain metadata.
- **File lifecycle** — uploads need at least 16 bytes and follow UPLOADING → UPLOADED → PROCESSING → READY. Completion verifies metadata and signatures; failures expose stable codes, not provider text.
- **Access URLs** — author previews require platform staff and `asset.read`; an asset ID alone grants no access. URLs sign `playbackKey ?? storageKey`, use type-specific TTLs, and are not cached or logged; no HEAD check is made before signing.
- **MVP processing** — passthrough processors retain uploads; video uses a signed MP4 URL, with no HLS yet. Prisma BigInt sizes are JSON numbers.
- **Cleanup** — the API-process scheduler runs non-overlapping batches and retries failed entries each run. Prefixes wait for upload URL expiry plus five minutes; stale non-READY files are removed, READY files are retained, and empty unreferenced assets are deleted.
- **Concurrent cleanup** — no distributed lock is used; queue and asset cleanup steps are idempotent across API instances.

## Storage

- **`StorageService` is abstract** — thin S3 boundary with an in-memory test implementation. Not a generic wrapper.
- **Presigned PUT URLs** — sign `content-type`, `content-length`, and `if-none-match` via `signableHeaders`. `If-None-Match: *` prevents overwrites. `content-length` signing prevents size mismatches (verified in Chrome and Firefox).
- **S3 checksum config** — `requestChecksumCalculation` and `responseChecksumValidation` set to `WHEN_REQUIRED` (SDK defaults break presigned browser uploads).
