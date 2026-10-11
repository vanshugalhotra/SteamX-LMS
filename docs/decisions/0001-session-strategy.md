# 0001: Session strategy

## Context

The API needs browser-based authentication, request-time account deactivation, and password-reset
revocation without introducing a server-side session store.

## Decision

- Issue a fixed one-day JWT in an `httpOnly` cookie.
- Store only `sub`, `iat`, and `exp` in the token.
- Look up the user and current school status in the database on every authenticated request.
- Do not use refresh tokens or a session table.
- Revoke earlier tokens by checking user/school status and comparing token `iat` with
  `passwordChangedAt` at whole-second precision.
- Require an allowed `Origin` on state-changing requests rather than adding CSRF tokens.
- Logout clears the browser cookie; it does not revoke a copied token before that token expires.
- Defer key rotation and sliding refresh.

## Reason

The cookie keeps tokens out of application JavaScript, while the database lookup makes account and
school status changes effective immediately. Password timestamp comparison provides targeted
revocation without session records. An exact Origin allow-list protects state-changing browser
requests without adding token-management state.

Key rotation is deferred because replacing the single signing key invalidates all active tokens;
planned rotation needs a key identifier and an overlap strategy. Sliding refresh is deferred because
it would extend sessions and require additional lifecycle and abuse controls without a current
product requirement.

## Consequences

Every protected request performs a database read. Logout only removes the current browser's cookie;
copied tokens remain usable until expiry unless account status or password change revokes them.
Tokens issued in the same whole second as `passwordChangedAt` are accepted. Origin must be configured
for every deployed frontend.
