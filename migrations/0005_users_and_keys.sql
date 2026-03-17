-- Per-user account foundation: users and API keys tables
CREATE TABLE IF NOT EXISTS users (
  id         TEXT NOT NULL PRIMARY KEY,
  google_id  TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  avatar_url TEXT,
  is_admin   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT NOT NULL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  name         TEXT NOT NULL,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
