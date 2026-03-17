-- Local-dev admin seed
INSERT OR IGNORE INTO users (id, google_id, email, name, is_admin, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  'dev-google-id',
  'admin@local.dev',
  'Local Admin',
  1,
  '2024-01-01T00:00:00.000Z'
);
