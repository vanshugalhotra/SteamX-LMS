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

INSERT INTO permissions (key, description)
VALUES
  ('school.read', 'View schools'),
  ('school.manage', 'Create and manage schools')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key IN ('school.read', 'school.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO permissions (key, description)
VALUES
  ('classsection.read', 'View class sections'),
  ('classsection.manage', 'Create, update, and delete class sections')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key IN ('classsection.read', 'classsection.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO permissions (key, description)
VALUES
  ('user.read', 'View users'),
  ('user.create.teacher', 'Create teacher users'),
  ('user.create.student', 'Create student users')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key IN ('user.read', 'user.create.teacher', 'user.create.student')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO permissions (key, description)
VALUES ('user.steamx-id.update', 'Rename a user SteamX ID')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key = 'user.steamx-id.update'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO permissions (key, description)
VALUES
  ('user.update', 'Update school user details'),
  ('user.deactivate', 'Change school user status')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key IN ('user.update', 'user.deactivate')
ON CONFLICT (role_id, permission_id) DO NOTHING;
