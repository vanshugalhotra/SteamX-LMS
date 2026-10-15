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

## 9. Schools

School routes require a session and permission:

| Route                        | Permission      |
| ---------------------------- | --------------- |
| `POST /schools`              | `school.manage` |
| `GET /schools`               | `school.read`   |
| `GET /schools/{id}`          | `school.read`   |
| `PATCH /schools/{id}`        | `school.manage` |
| `PATCH /schools/{id}/status` | `school.manage` |

Only Admin has these permissions by default. A Teacher needs an explicit `school.read`
grant to test school reads.

### Create: `POST /schools`

| Case                                                | Expected                   |
| --------------------------------------------------- | -------------------------- |
| Valid school                                        | `201`, code is normalized  |
| Existing code, including different letter case      | `409` `SCHOOL_CODE_EXISTS` |
| Invalid code or blank required text                 | `400` `VALIDATION_ERROR`   |
| Invalid contact email                               | `400` `VALIDATION_ERROR`   |
| Unknown body field                                  | `400` `VALIDATION_ERROR`   |
| Teacher or Student, even if granted `school.manage` | `403`                      |

### List: `GET /schools`

Query parameters: `page` (default `1`, maximum `100000`), `limit` (default `20`, maximum
`100`), optional `status` (`ACTIVE` or `INACTIVE`), and optional `q`.

Example: `GET /api/v1/schools?page=1&limit=10&status=ACTIVE&q=ab`

`q` searches school name or code, case-insensitively.
Admin sees all matching schools. A Teacher with `school.read` sees only their own school.
Limits outside the allowed range return `400` `VALIDATION_ERROR`.

### View and edit

| Route / case                               | Expected                                          |
| ------------------------------------------ | ------------------------------------------------- |
| Admin gets any school by UUID              | `200`, school response                            |
| Teacher with `school.read` gets own school | `200`                                             |
| Teacher gets another school's ID           | `404` `NOT_FOUND`                                 |
| Teacher requests a random UUID             | Same `404` body as foreign ID, except `requestId` |
| `PATCH /schools/{id}` with editable fields | `200`, updated school                             |
| PATCH body includes `code` or `status`     | `400` `VALIDATION_ERROR`                          |
| PATCH body is empty                        | `400` `VALIDATION_ERROR`                          |
| PATCH optional field to `null`             | `200`, field is cleared                           |
| Teacher or Student tries to edit           | `403`                                             |

### Change status: `PATCH /schools/{id}/status`

Body: `{ "status": "INACTIVE" }` or `{ "status": "ACTIVE" }`.

| Case                         | Expected                                       |
| ---------------------------- | ---------------------------------------------- |
| Admin changes status         | `200`; repeating the same status is also `200` |
| Invalid status               | `400` `VALIDATION_ERROR`                       |
| School is inactive           | Its users' next request and login return `401` |
| Another school's teacher     | Remains able to use their own-school routes    |
| Admin reactivates the school | Its users can log in again                     |

## 10. Class sections

Class-section routes require a session and permission:

| Route                         | Permission            |
| ----------------------------- | --------------------- |
| `POST /class-sections`        | `classsection.manage` |
| `GET /class-sections`         | `classsection.read`   |
| `GET /class-sections/{id}`    | `classsection.read`   |
| `PATCH /class-sections/{id}`  | `classsection.manage` |
| `DELETE /class-sections/{id}` | `classsection.manage` |

Only Admin has these permissions by default. A Teacher needs an explicit `classsection.read`
grant to test school-scoped reads.

| Case                                                 | Expected                                                  |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Admin creates with `schoolId` and `className`        | `201`, `sectionName` is `All`                             |
| Admin creates with a `sectionName`                   | `201`, one section returned                               |
| Duplicate class and section names (case-insensitive) | `409` `CLASS_SECTION_EXISTS`                              |
| Unknown or inactive school                           | `404`, or `409` `SCHOOL_INACTIVE`, respectively           |
| Admin creates without `schoolId`                     | `400` `VALIDATION_ERROR`                                  |
| Blank/invalid name or unknown body field             | `400` `VALIDATION_ERROR`                                  |
| List with `page`, `limit`, `q`, or `schoolId`        | Paginated, filtered results                               |
| Teacher with `classsection.read` lists sections      | Only their own school's sections                          |
| Teacher requests another school's section            | `404` `NOT_FOUND`                                         |
| Admin updates or deletes an empty section            | `200` on update; `204` on delete                          |
| Update with an empty body or duplicate names         | `400` `VALIDATION_ERROR`, or `409` `CLASS_SECTION_EXISTS` |
| Delete a section assigned to a student               | `409` `CLASS_SECTION_IN_USE`                              |

## 11. Users

| Route                  | Permission            |
| ---------------------- | --------------------- |
| `POST /users/teachers` | `user.create.teacher` |
| `POST /users/students` | `user.create.student` |
| `GET /users`           | `user.read`           |
| `GET /users/{id}`      | `user.read`           |

Only Admin has these permissions by default. School staff visibility is fail-closed to their
own user; they need an explicit permission grant to test the routes.

| Case                                                  | Expected                                  |
| ----------------------------------------------------- | ----------------------------------------- |
| Platform staff creates teacher/student with school ID | `201`, user ID and profile returned       |
| Platform staff creates without school ID              | `400` `SCHOOL_REQUIRED`                   |
| Inactive school or unknown school                     | `409` `SCHOOL_INACTIVE`, or `404`         |
| Student class section belongs to another school       | `404`                                     |
| List with role, status, school, search and pagination | Matching paginated users                  |
| School staff lists users or opens a foreign user      | Own user only; foreign user returns `404` |
| Create/list/view responses                            | Never include `passwordHash`              |

## 12. Health

| Endpoint            | Case                 | Expected |
| ------------------- | -------------------- | -------- |
| `GET /health/live`  | No cookie, no Origin | `200`    |
| `GET /health/ready` | DB up                | `200`    |
| `GET /health/ready` | DB down              | `503`    |
