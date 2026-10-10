# Manual API workflow testing

Use Swagger UI at `/api/docs` or Postman against the running API. For state-changing
requests, set `Origin` to an exact entry in `CORS_ORIGINS` (for example,
`http://localhost:5173`). Browsers set this header automatically.

## Authentication

- **Login — `POST /api/v1/auth/login`:** Submit a valid SteamX ID and password.
  Expect `200`, a profile, and an HTTP-only `steamx_session` cookie. Try a
  padded lowercase ID, a wrong password, an unknown ID, an inactive user, and
  an inactive school; failures should all return the same generic `401`.
- **Current profile — `GET /api/v1/auth/me`:** Send the login cookie. Expect
  `200` with the profile and `Cache-Control: no-store`. Without the cookie,
  expect `401`.
- **Logout — `POST /api/v1/auth/logout`:** Send the login cookie and allowed
  `Origin`. Expect `204` and an expired `steamx_session` cookie; `/auth/me`
  without a valid session should then return `401`.
- For an account with `mustChangePassword`, login should succeed, `/auth/me`
  and logout should work, while other protected routes return `403`.

## Origin and health checks

- Try login or logout without `Origin`, with `Origin: null`, or with an
  unlisted origin. Expect `403` with code `ORIGIN_NOT_ALLOWED`.
- Send an invalid login body with an allowed Origin. Expect `400` with code
  `VALIDATION_ERROR`.
- **Liveness — `GET /health/live`:** Expect `200` without a cookie or Origin.
- **Readiness — `GET /health/ready`:** Expect `200` when the database is
  available; expect `503` if it is unavailable.
