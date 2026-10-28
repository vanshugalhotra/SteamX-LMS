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

- **Lifecycle and deletion** — courses, modules, and lessons share `canTransitionContentStatus`: status never returns to `DRAFT`, while `DRAFT → ARCHIVED` is allowed. Course titles are not unique.
- **Archival and release access** — a parent archives active descendants only; restoring it does not restore children. Draft content is not student-visible, while already-released active or archived content remains available until subscription expiry.
- **Deletes are FK-restricted** — deleting a resource with dependents returns `RESOURCE_IN_USE`.
- **Ordering and outline** — reorders take the complete ID list under a parent lock; unpaginated module/lesson lists support that contract. `GET /courses/:id/outline` is an admin-only, unfiltered read model; writes remain in their owning feature.

## Lesson content

- **Read model and validation boundary** — `GET /lessons/:id/content` returns the save-shaped block tree, version, and referenced asset summaries. Curriculum uses the assets module's summary API; pure block validation is separate from persistence.
- **Whole-lesson atomic saves** — `PUT` replaces all blocks in one transaction; delete children before parents and recreate positional rows because database uniqueness is immediate. There is no per-block API.
- **Version and retry rules** — lock the lesson, recognize a normalized no-op before checking `expectedVersion`, and reject stale changed content with `VERSION_CONFLICT`. Successful changed saves increment `content_version` once; failed transactions do not.
- **Asset references** — new references require an active asset, matching type, and READY file; references already in the lesson remain valid after archival or loss of a READY file. Asset summaries are read through the save transaction.
- **Block identity and layout** — clients supply UUID block IDs; duplicates and IDs owned by another lesson are rejected. Two-column layouts have exactly two nullable slots, permit at most one non-layout block per slot, and cannot nest.
- **Accepted save races** — a simultaneous cross-lesson block-ID collision or asset deletion between validation and insert can still produce a generic `500`; these rare races are not handled specially.
- **Rich text and supported formats** — the block tree is editor-independent, but the only accepted rich-text format is TipTap. Unknown nodes, marks, fields, and attributes fail; TipTap link `target`, `rel`, and `class` attributes are accepted and dropped.
- **Limits and history** — JSON requests are capped at 1 MB; a lesson has at most 100 blocks, 50,000 rich-text characters/document, 5,000 rich-text nodes/document, depth 20, and 50 reported issues. Saves replace current content; there is no version history.
- **Unsupported block types** — PPTX remains in the asset/database enums for compatibility but is not accepted as lesson content.

## Asset library

- **Listing** — `GET /assets` requires `asset.read`, lists ACTIVE assets by default (ARCHIVED is opt-in), and includes assets regardless of file state. The file summary prefers READY, otherwise the newest attempt, and is null when no files exist. `fileStatus` matches assets with any file in that state; this lets management find failed/in-flight replacement attempts even while a READY file remains.
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
