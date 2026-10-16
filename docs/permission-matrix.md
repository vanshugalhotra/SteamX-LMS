# Roles and permissions

## Roles

| Key       | Name    | User type        |
| --------- | ------- | ---------------- |
| `admin`   | Admin   | `PLATFORM_STAFF` |
| `teacher` | Teacher | `SCHOOL_STAFF`   |
| `student` | Student | `STUDENT`        |

## Permissions

| Key                     | Description               | Admin | Teacher | Student |
| ----------------------- | ------------------------- | :---: | :-----: | :-----: |
| `user.password.reset`   | Reset a user password     |  Yes  |   No    |   No    |
| `user.read`             | View users                |  Yes  |   No    |   No    |
| `user.create.teacher`   | Create teacher users      |  Yes  |   No    |   No    |
| `user.create.student`   | Create student users      |  Yes  |   No    |   No    |
| `user.steamx-id.update` | Rename a user's SteamX ID |  Yes  |   No    |   No    |
| `school.read`           | View schools              |  Yes  |   No*   |   No    |
| `school.manage`         | Create and manage schools |  Yes  |   No    |   No    |
| `classsection.read`     | View class sections       |  Yes  |   No    |   No    |
| `classsection.manage`   | Manage class sections     |  Yes  |   No    |   No    |

`school.read` is granted to teachers selectively when explicitly authorized.
`classsection.read` and `classsection.manage` were added in TEN-3.
`user.read`, `user.create.teacher`, and `user.create.student` were added in TEN-4.
`user.steamx-id.update` is granted to admins only.

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
