# Decisions

Each item records the current design and the reason it is used.

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
