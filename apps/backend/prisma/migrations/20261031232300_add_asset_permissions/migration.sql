INSERT INTO permissions (key, description)
VALUES
  ('asset.read', 'Read asset file state'),
  ('asset.write', 'Create assets and upload asset files')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.key = 'admin'
  AND permissions.key IN ('asset.read', 'asset.write')
ON CONFLICT (role_id, permission_id) DO NOTHING;
