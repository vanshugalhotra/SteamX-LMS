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

`columns` is a fixed two-item array. Each entry is `null` or one non-layout block; layouts cannot
be nested. Asset IDs are top-level block fields, never part of `content`. PPTX blocks are not
supported. Titles, alt text, and captions are trimmed; empty optional alt text and captions are
omitted.

## Rich-text whitelist

| Rich-text type | Kept                                                                                                                                                                                                           | Accepted and dropped                                         | Rejected                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Nodes          | `doc`, `paragraph`, `heading` (level 1–3), `bulletList`, `orderedList` (start >= 1), `listItem`, `blockquote`, `codeBlock` (language up to 30 `[a-z0-9+#-]` characters), `horizontalRule`, `text`, `hardBreak` | Null-valued attributes                                       | Other node types, including image and table                                                      |
| Content        | Document → paragraphs, headings, lists, blockquotes, code blocks, horizontal rules; paragraph/heading → inline; lists → list items; list items → paragraphs/lists; blockquotes → paragraphs/lists              | —                                                            | Any other parent/child combination                                                               |
| Marks          | `bold`, `italic`, `underline`, `strike`, `code`, `link` (`href` required); duplicate marks are de-duplicated                                                                                                   | TipTap link `target`, `rel`, and `class`; empty marks arrays | Other marks and any other attributes                                                             |
| Text alignment | Paragraph/heading `textAlign`: `left`, `center`, `right`, `justify`                                                                                                                                            | —                                                            | Other values                                                                                     |
| Links          | Absolute `http:`, `https:`, and `mailto:` URLs without whitespace/control characters                                                                                                                           | —                                                            | Relative, `javascript:`, `data:`, `ftp:`, other protocols, and URLs longer than 2,000 characters |

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

Validation issue codes: `INVALID_CONTENT`, `INVALID_ID`, `DUPLICATE_ID`, `BLOCK_TYPE_NOT_SUPPORTED`,
`UNKNOWN_FIELD`, `ASSET_REQUIRED`, `ASSET_NOT_ALLOWED`, `TOO_MANY_BLOCKS`, `TOO_LONG`,
`TOO_MANY_NODES`, `DEPTH_EXCEEDED`, `INVALID_LINK`, `UNSUPPORTED_ATTRIBUTE`, `UNSUPPORTED_NODE`,
and `UNSUPPORTED_MARK`.

IDs must be UUIDs. The client creates each block ID before saving and keeps it stable while editing;
IDs must be unique across the entire request, including column children. The server rejects
collisions. Asset IDs are UUIDs too and can be shared by blocks.

## Adding a block type

1. Add one block definition file under `apps/backend/src/curriculum/lesson-content/block-definitions/`.
2. Register it in `block-definitions/registry.ts` using the generated Prisma `BlockType`.
3. Add the enum value through a Prisma schema migration; if it references an asset, declare its
   required `AssetType` in the block definition.
4. Add a frontend renderer for the new block shape.
