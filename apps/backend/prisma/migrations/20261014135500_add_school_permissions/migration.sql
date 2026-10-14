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
