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

- **Listing** — `GET /assets` lists ACTIVE assets with a READY file; ARCHIVED is opt-in. Detail shows the READY file (or newest attempt) and up to 50 where-used lessons with the full count.
- **Archive and delete** — archived assets leave the list but stay viewable. Deletion is blocked by the DB FK if the asset is used in blocks.
- **Replacement** — asset ID stays stable. Old READY file serves until replacement succeeds. In-flight UPLOADED/PROCESSING files block new replacements. The swap is one transaction: delete old READY → flip new to READY. Failure rolls back and the old file keeps serving. Removed prefixes are queued for async S3 cleanup.
- **Upload contract** — IMAGE: JPEG/PNG/WEBP. PDF: PDF. VIDEO: MP4. PPTX: rejected. Keys use `assets/<asset-id>/<file-id>/`; client filenames stay in metadata.
- **File lifecycle** — uploads need at least 16 bytes. UPLOADING → UPLOADED → PROCESSING → READY. Completion verifies S3 HEAD metadata and file-signature bytes. Failure codes are stable strings, not provider messages.
- **Access** — author previews need `asset.read` + platform staff; an asset ID alone grants no access. Signed URL uses `playbackKey ?? storageKey`, per-type TTL, `Cache-Control: no-store`. No HEAD check before signing.
- **Processing** — passthrough for all types; VIDEO sets `playbackKey = storageKey`. HLS replaces the video processor later without a schema change.
- **Cleanup** — in-process scheduler; non-overlapping, idempotent, no distributed lock. Prefixes wait upload-URL-TTL + 5 min before S3 delete. Stale non-READY files removed after 24 h (configurable). Empty unreferenced assets removed.

## Storage

- **Abstract boundary** — `StorageService` is abstract with an S3 implementation and an in-memory test double. Not a generic wrapper.
- **Presigned PUT** — signs `Content-Type`, `Content-Length`, and `If-None-Match: *` via `signableHeaders` to prevent overwrites and mismatches.
- **SDK checksums** — `requestChecksumCalculation` and `responseChecksumValidation` set to `WHEN_REQUIRED`; SDK defaults break presigned browser uploads.
