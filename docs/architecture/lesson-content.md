# Lesson content

Lesson content is an ordered list of blocks. Each block has a client-generated UUID `id`, a
`type`, and a type-specific `content` object. Asset-backed blocks also have an `assetId`. The
examples below show the block shape; UUIDs are shortened only for readability.

```json
{
  "id": "uuid",
  "type": "RICH_TEXT",
  "content": { "format": "tiptap", "doc": { "type": "doc", "content": [] } }
}
```

```json
{
  "id": "uuid",
  "type": "ACCORDION",
  "content": { "title": "More", "body": { "format": "tiptap", "doc": { "type": "doc" } } }
}
```

```json
{
  "id": "uuid",
  "type": "IMAGE",
  "assetId": "uuid",
  "content": { "alt": "A diagram", "caption": "Overview" }
}
```

```json
{ "id": "uuid", "type": "VIDEO", "assetId": "uuid", "content": { "caption": "Introduction" } }
```

```json
{ "id": "uuid", "type": "PDF", "assetId": "uuid", "content": { "caption": "Handout" } }
```

```json
{
  "id": "uuid",
  "type": "TWO_COLUMN",
  "content": {},
  "columns": [
    null,
    {
      "id": "uuid",
      "type": "RICH_TEXT",
      "content": { "format": "tiptap", "doc": { "type": "doc" } }
    }
  ]
}
```

`columns` is exactly two entries; each is `null` or one non-layout block. Layouts cannot be nested.
Asset IDs are top-level block fields. Supported blocks are `RICH_TEXT`, `ACCORDION`, `IMAGE`,
`VIDEO`, `PDF`, and `TWO_COLUMN`; PPTX is not accepted. Titles, alt text, and captions are trimmed;
empty optional alt text and captions are omitted.

## Reading content

`GET /lessons/:id/content` returns the complete save-shaped tree together with its version and an
asset side table:

This is the platform-admin builder read. It returns content regardless of lesson status or audience.
Grant `curriculum.read` only to platform admins: teacher/student delivery reads need a separate
endpoint that checks lesson release and access rules.

```json
{
  "version": 0,
  "blocks": [],
  "assets": {
    "asset-uuid": {
      "id": "asset-uuid",
      "type": "IMAGE",
      "title": "Diagram",
      "status": "ACTIVE",
      "file": {
        "status": "READY",
        "mimeType": "image/png",
        "sizeBytes": 1024,
        "originalFilename": "diagram.png",
        "lastError": null
      }
    }
  }
}
```

`blocks` is save-shaped and can be sent back unchanged. `assets` is keyed by referenced asset ID
and contains metadata/current file state, not URLs or storage identifiers. Keep this side table
separate from editable blocks; request temporary URLs from the asset-access endpoint when needed.
Render rich-text `text` as text, never executable HTML. `version` is the concurrency token.

## Saving content

`PUT /lessons/:id/content` replaces the complete lesson tree. Send the latest version with all
blocks, including their stable client-generated IDs:

```json
{
  "expectedVersion": 3,
  "blocks": [
    {
      "id": "uuid",
      "type": "RICH_TEXT",
      "content": { "format": "tiptap", "doc": { "type": "doc", "content": [] } }
    }
  ]
}
```

The response has the same `{ version, blocks, assets }` shape as the read endpoint. A changed save
replaces the full tree and increments `version`; omitted blocks are deleted and re-sent IDs are
preserved when blocks move. An unchanged normalized tree is a no-op and does not increment the
version, even if its `expectedVersion` is stale.

Send a nonnegative integer `expectedVersion` and a `blocks` array; unknown request fields are
rejected. Serialize saves in the frontend. On `409 VERSION_CONFLICT`, reload and re-apply the edit
before saving. Retrying an identical successful request is safe.

New references require an ACTIVE asset, a READY file, and the matching asset type. Existing
references may remain after archival or loss of the READY file; type mismatches are still invalid.
Assets may be shared by blocks and lessons.

The JSON request body limit is 1 MB. All failed saves leave the blocks and version unchanged.
Errors use `{ statusCode, code, message, requestId }` with optional `details`; an oversized body
returns `413 PAYLOAD_TOO_LARGE`.

## Rich-text whitelist

- **Format:** only `{ format: "tiptap", doc: ... }` is supported.
- **Nodes:** `doc`, paragraph, heading (level 1–3), bullet/ordered list (start >= 1), list item,
  blockquote, code block (language <= 30 `[a-z0-9+#-]` chars), horizontal rule, text, hard break.
  Parent/child structure is validated; other nodes (including image/table) are rejected.
- **Marks and attributes:** bold, italic, underline, strike, code, and link (`href` required).
  Duplicate marks are de-duplicated. Null attributes and TipTap link `target`, `rel`, `class` are
  dropped; other marks/attributes fail. Paragraph/heading `textAlign` is left, center, right, or
  justify.
- **Links:** absolute `http:`, `https:`, or `mailto:` URLs, no whitespace/control characters, max
  2,000 characters. Relative URLs and other protocols fail.

Text is preserved exactly as text, including strings that look like HTML. Rendering must treat it
as text, not executable markup.

## Limits and errors

| Limit                                                 | Maximum           |
| ----------------------------------------------------- | ----------------- |
| Blocks in the whole lesson, including column children | 100               |
| Accordion title                                       | 200 characters    |
| Image alt text or caption; video/PDF caption          | 300 characters    |
| Text in one rich-text document                        | 50,000 characters |
| Nodes in one rich-text document (including `doc`)     | 5,000             |
| Rich-text nesting depth (including `doc`)             | 20                |
| Link URL                                              | 2,000 characters  |
| Returned validation issues                            | 50                |

Validation issue codes: `INVALID_CONTENT`, `INVALID_ID`, `DUPLICATE_ID`, `BLOCK_ID_IN_USE`,
`BLOCK_TYPE_NOT_SUPPORTED`, `UNKNOWN_FIELD`, `ASSET_REQUIRED`, `ASSET_NOT_ALLOWED`,
`ASSET_NOT_FOUND`, `ASSET_TYPE_MISMATCH`, `ASSET_ARCHIVED`, `ASSET_NOT_READY`,
`TOO_MANY_BLOCKS`, `TOO_LONG`, `TOO_MANY_NODES`, `DEPTH_EXCEEDED`, `INVALID_LINK`,
`UNSUPPORTED_ATTRIBUTE`, `UNSUPPORTED_NODE`, and `UNSUPPORTED_MARK`. Envelope errors also include
`VALIDATION_ERROR`, `BAD_REQUEST`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`,
`VERSION_CONFLICT`, and `PAYLOAD_TOO_LARGE`.

Block and asset IDs must be UUIDs. Block IDs must be unique across the request and cannot belong to
another lesson; the same lesson may retain IDs across saves. Asset IDs can be shared by blocks.

## Adding a block type

1. Add its Prisma `BlockType` enum value through a migration and a definition under
   `block-definitions/`; register it in `registry.ts` and declare any required `AssetType`.
2. Add validator/unit and HTTP tests for its shape, invalid fields, and asset rules.
3. Add the frontend renderer for the documented response/save shape.
