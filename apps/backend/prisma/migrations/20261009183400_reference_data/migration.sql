INSERT INTO roles (key, name, user_type)
VALUES
  ('admin', 'Admin', 'PLATFORM_STAFF'),
  ('teacher', 'Teacher', 'SCHOOL_STAFF'),
  ('student', 'Student', 'STUDENT')
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    user_type = EXCLUDED.user_type;

INSERT INTO permissions (key, description)
VALUES ('user.password.reset', 'Reset a user password')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key = 'user.password.reset'
ON CONFLICT (role_id, permission_id) DO NOTHING;
