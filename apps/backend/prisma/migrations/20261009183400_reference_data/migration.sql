-- ── Roles ────────────────────────────────────────────────
INSERT INTO roles (key, name, user_type)
VALUES
  ('admin',   'Admin',   'PLATFORM_STAFF'),
  ('teacher', 'Teacher', 'SCHOOL_STAFF'),
  ('student', 'Student', 'STUDENT')
ON CONFLICT (key) DO UPDATE
SET name      = EXCLUDED.name,
    user_type = EXCLUDED.user_type;

-- ── Permissions ─────────────────────────────────────────
INSERT INTO permissions (key, description)
VALUES
  -- Assets
  ('asset.read',             'Read asset file state'),
  ('asset.write',            'Create assets and upload asset files'),
  -- Class sections
  ('classsection.manage',    'Create, update, and delete class sections'),
  ('classsection.read',      'View class sections'),
  -- Curriculum
  ('curriculum.read',        'View global curriculum content'),
  ('curriculum.write',       'Create and manage global curriculum content'),
  -- Schools
  ('school.manage',          'Create and manage schools'),
  ('school.read',            'View schools'),
  -- Subscriptions
  ('subscription.manage',    'Grant and manage school course subscriptions'),
  -- Users
  ('user.create.student',    'Create student users'),
  ('user.create.teacher',    'Create teacher users'),
  ('user.deactivate',        'Change school user status'),
  ('user.password.reset',    'Reset a user password'),
  ('user.read',              'View users'),
  ('user.steamx-id.update',  'Rename a user SteamX ID'),
  ('user.update',            'Update school user details')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

-- ── Admin grants (all current permissions) ──────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key IN (
    'asset.read',
    'asset.write',
    'classsection.manage',
    'classsection.read',
    'curriculum.read',
    'curriculum.write',
    'school.manage',
    'school.read',
    'subscription.manage',
    'user.create.student',
    'user.create.teacher',
    'user.deactivate',
    'user.password.reset',
    'user.read',
    'user.steamx-id.update',
    'user.update'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
