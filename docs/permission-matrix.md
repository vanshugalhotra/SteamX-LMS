# Roles and permissions

## Roles

| Key       | Name    | User type        |
| --------- | ------- | ---------------- |
| `admin`   | Admin   | `PLATFORM_STAFF` |
| `teacher` | Teacher | `SCHOOL_STAFF`   |
| `student` | Student | `STUDENT`        |

## Permissions

| Key                   | Description           | Admin | Teacher | Student |
| --------------------- | --------------------- | :---: | :-----: | :-----: |
| `user.password.reset` | Reset a user password |  Yes  |   No    |   No    |

## Routes that require a session but no specific permission

- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/change-password`

## Public routes

- `GET /health/live`
- `GET /health/ready`
- `POST /api/v1/auth/login`

Roles and permissions are migration-managed. Update this document in the same PR as any
permission change. Permission mappings are loaded at application startup; restart the backend
after changing role-permission data in the database.
