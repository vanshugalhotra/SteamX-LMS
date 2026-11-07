# Decisions

This page records current design choices that affect implementation; check it before changing the
related schema or workflow.

## Identity and sessions

- **One account name:** Context: account creation, display, and ID generation use one name.
  Decision: store `name`, not first/last-name fields. Consequence: all three workflows use that
  same value.
- **Cookie session with live lookup:** Context: protected requests must use current account and
  school status. Decision: store a JWT cookie and reload the account from PostgreSQL per request.
  Consequence: deactivation applies on the next request without a session table.
- **No SteamX ID history:** Context: the schema has no history table. Decision: store only the
  current ID. Consequence: prior IDs are not queryable.

## Tenancy

- **Explicit school scope:** Context: platform-wide access must be deliberate. Decision: services
  pass scope into repository queries. Consequence: tenant filters are visible at the data access
  boundary.
- **Same 404 for foreign and missing resources:** Context: foreign resources are out of scope.
  Decision: scoped lookups use the same not-found response. Consequence: callers cannot distinguish
  a foreign ID from a missing one.
- **School is the tenant key:** Context: users and school-owned records belong to a school.
  Decision: class/section names are school-owned rows. Consequence: uniqueness is enforced within
  a school.

## Deliveries and enrollment

- **Enrollment grants learning access:** Context: class-section membership can change. Decision:
  active enrollment, not current class, grants delivery membership. Consequence: a class change does
  not change enrollment access.
- **Labeled deliveries:** Context: a school/course/year may have multiple groups. Decision: require
  a label unique within school, course, and academic year. Consequence: the active-delivery cap
  counts labeled groups across years.

## Curriculum and assets

- **Content status:** Context: content statuses are DRAFT, ACTIVE, and ARCHIVED. Decision: no
  transition returns to DRAFT; archiving a parent archives active descendants, not drafts.
  Consequence: restoring a parent does not restore its archived children.
- **Ordering:** Context: sibling positions are unique. Decision: reorder calls supply the complete
  child ID set. Consequence: partial reorder requests are rejected.
- **Lesson content saves:** Context: content is a versioned block tree. Decision: save the full tree
  in one transaction. Consequence: changed stale versions fail, while normalized no-op retries do
  not increment the version.
- **Block identity:** Context: blocks are client-identified. Decision: UUID block IDs belong to one
  lesson. Consequence: reusing another lesson's ID fails.
- **Asset replacement:** Context: an asset may have a READY file while a new upload is processing.
  Decision: keep the previous READY file until replacement succeeds. Consequence: failed
  replacement leaves the prior file in service, and removed prefixes are queued for cleanup.
- **File processing:** Context: the current registered processors do not transform files.
  Decision: pass supported uploads through. Consequence: video playback uses the stored file key;
  HLS conversion is not implemented.

For enforced details, see [database constraints](./database.md), [access control](./access-control.md),
and [lesson content](./lesson-content.md).
