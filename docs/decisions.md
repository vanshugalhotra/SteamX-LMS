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
- **Lesson content read model** — `GET /lessons/:id/content` returns the save-shaped block tree plus an asset side table, so the frontend never strips or merges metadata. Curriculum obtains summaries through an exported assets-module method rather than reading asset tables.
- **Whole-lesson replacement** — save deletes child blocks before all remaining blocks, then inserts the new tree in one transaction. No diff/upsert is used because positional unique constraints are immediate.
- **Save ordering and concurrency** — lock the lesson first, compare for a no-op before checking the expected version, then reject stale changed content with `VERSION_CONFLICT`. This makes retries safe while protecting against stale editor tabs.
- **Asset references in saves** — new references must use an active asset of the matching type with a READY file; references already in the lesson remain valid if the asset is archived or loses its READY file. Asset summaries are read through the save transaction client.
- **Client block IDs** — IDs are supplied by the editor and can be reused across saves only for the same lesson; save rejects IDs owned by another lesson. Two rare races are accepted: a simultaneous cross-lesson UUID collision and asset deletion between validation and insert can result in a generic 500.
- **JSON body limit** — lesson content requests use a 1 MB JSON body limit, which bounds the actual lesson payload.
- **Optimistic whole-lesson saves** — `content_version` is preferred over last-write-wins because a stale editor tab could silently overwrite the entire lesson. The cost is one integer column.
- **No content version history** — replacements aren't archived versions. Add when revision browsing becomes a requirement.
- **Editor-agnostic block tree** — lesson blocks and layouts do not depend on an editor; only `lesson-content/rich-text/` knows TipTap. Rich text carries a `format` tag, so another editor format can be introduced without changing the storage schema.
- **Reject unknown lesson content** — unknown fields, nodes, marks, and attributes fail validation so client/server mismatches surface early rather than silently losing data. TipTap's default link `target`, `rel`, and `class` attributes are accepted and dropped.
- **Client-generated block IDs** — clients assign stable UUIDs for editor identity and future per-block features; the server rejects duplicate IDs across the full tree.
- **Fixed two-column layout** — columns are always a two-item array of nullable blocks. This keeps the layout contract simple and prevents nested layouts.
- **No PPTX lesson blocks** — the database enum retains PPTX for asset compatibility, but lesson content validation does not accept PPTX blocks.
- **Bounded lesson content** — cap blocks (100), text (50,000 characters/document), rich-text nodes (5,000/document), depth (20), and issue reporting (50). These limits bound validation work and keep oversized or deeply nested editor input from exhausting memory or the call stack.

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
