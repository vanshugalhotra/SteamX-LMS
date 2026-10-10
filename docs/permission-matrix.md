# Permission matrix

| Permission            | Admin (`PLATFORM_STAFF`) | Teacher (`SCHOOL_STAFF`) | Student (`STUDENT`) |
| --------------------- | -----------------------: | -----------------------: | ------------------: |
| `user.password.reset` |                      Yes |                       No |                  No |

Roles and permissions are migration-managed. Update this matrix whenever permissions change.

## Routes that require a session but no specific permission

- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/change-password`
