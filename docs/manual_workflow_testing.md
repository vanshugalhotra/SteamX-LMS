# Manual API Testing

**Tools:** Swagger UI at `/api/docs`, or Postman.
**Base path:** `/api/v1`

## Setup (applies to every request below)

- **Cookie:** `steamx_session` (HTTP-only, set on login). Send it on all protected routes.
- **Origin:** on POST/PUT/PATCH/DELETE, set `Origin` to an exact entry in `CORS_ORIGINS` (e.g. `http://localhost:5173`). Browsers do this automatically.
- **Test accounts needed:** Admin, Teacher, Student, an inactive user, a user in an inactive school, and a user with `mustChangePassword = true`.

---

## 1. Login: `POST /auth/login`

| Case                       | Expected                                               |
| -------------------------- | ------------------------------------------------------ |
| Valid ID + password        | `200`, profile in body, `steamx_session` cookie set    |
| ID with spaces / lowercase | `200` (ID is normalized)                               |
| Wrong password             | `401` generic                                          |
| Unknown ID                 | `401` generic (same body as above)                     |
| Inactive user              | `401` generic                                          |
| User in inactive school    | `401` generic                                          |
| Admin (no school)          | `200` (school check skipped)                           |
| Empty or malformed body    | `400` `VALIDATION_ERROR`                               |
| 5+ rapid wrong attempts    | `429` with `Retry-After` (once rate limiting is built) |

**Check:** all `401` responses are identical, so valid IDs can't be guessed.

## 2. Current profile: `GET /auth/me`

| Case                                | Expected                                  |
| ----------------------------------- | ----------------------------------------- |
| With cookie                         | `200`, profile, `Cache-Control: no-store` |
| Without cookie                      | `401`                                     |
| With a `mustChangePassword` account | `200`                                     |

**Check:** the response never contains `passwordHash`.

## 3. Logout: `POST /auth/logout`

| Case                                   | Expected                               |
| -------------------------------------- | -------------------------------------- |
| With cookie                            | `204`, `steamx_session` cookie expired |
| `/auth/me` afterwards (cookie cleared) | `401`                                  |
| With a `mustChangePassword` account    | `204`                                  |

## 4. Forced password change (`mustChangePassword = true`)

| Case                                | Expected                |
| ----------------------------------- | ----------------------- |
| Login                               | `200`                   |
| `/auth/me`, logout, change-password | Work                    |
| Any other protected route           | `403`                   |
| After a successful change-password  | Other routes work again |

## 5. Change own password: `POST /auth/change-password`

| Case                                              | Expected                             |
| ------------------------------------------------- | ------------------------------------ |
| Correct current + valid new                       | `200`, updated profile, fresh cookie |
| Wrong current password                            | `400`                                |
| New = current                                     | `400`                                |
| New violates policy (too short, equals SteamX ID) | `400`                                |
| Old session after change                          | Rejected (`401`)                     |
| Login with new password                           | `200`                                |
| Login with old password                           | `401`                                |

**Note:** a session issued in the same second as the change may still work. Wait 2 seconds before testing "old session rejected".

## 6. Reset another user's password: `POST /users/{userId}/reset-password`

| Case                                 | Expected                           |
| ------------------------------------ | ---------------------------------- |
| Admin resets any user                | `204`, no password in response     |
| Target logs in with the new password | `200`, `mustChangePassword = true` |
| Target's earlier session             | Rejected (`401`)                   |
| Admin's own session                  | Still valid                        |
| Teacher or Student calls it          | `403`                              |
| Unknown `userId`                     | `404`                              |
| Weak password (policy violation)     | `400`                              |
| Admin resets their own ID            | Rejected (use change-password)     |

**Note:** same one-second caveat as section 5.

## 7. Revocation (session dies on the next request)

| Action                    | Expected on the user's next request |
| ------------------------- | ----------------------------------- |
| Set user `INACTIVE`       | `401`                               |
| Set school `INACTIVE`     | `401`                               |
| Password changed or reset | `401`                               |

## 8. Origin protection (any POST/PUT/PATCH/DELETE)

Test once, using login or logout.

| Case                   | Expected                   |
| ---------------------- | -------------------------- |
| Missing `Origin`       | `403` `ORIGIN_NOT_ALLOWED` |
| `Origin: null`         | `403` `ORIGIN_NOT_ALLOWED` |
| Unlisted origin        | `403` `ORIGIN_NOT_ALLOWED` |
| Allowed origin         | Request proceeds           |
| `GET` without `Origin` | Works                      |

## 9. Health

| Endpoint            | Case                 | Expected |
| ------------------- | -------------------- | -------- |
| `GET /health/live`  | No cookie, no Origin | `200`    |
| `GET /health/ready` | DB up                | `200`    |
| `GET /health/ready` | DB down              | `503`    |
