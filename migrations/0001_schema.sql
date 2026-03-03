CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  latest_scan_id TEXT
);

CREATE TABLE IF NOT EXISTS scans (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  endpoint_ids   TEXT NOT NULL DEFAULT '[]',
  suggestion_ids TEXT NOT NULL DEFAULT '[]',
  graph          TEXT NOT NULL DEFAULT '{}',
  summary        TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS endpoints (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  scan_id       TEXT NOT NULL,
  provider      TEXT NOT NULL,
  method        TEXT NOT NULL,
  url           TEXT NOT NULL,
  files         TEXT NOT NULL DEFAULT '[]',
  call_sites    TEXT NOT NULL DEFAULT '[]',
  calls_per_day REAL NOT NULL DEFAULT 0,
  monthly_cost  REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS suggestions (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL,
  scan_id                   TEXT NOT NULL,
  type                      TEXT NOT NULL,
  severity                  TEXT NOT NULL,
  affected_endpoints        TEXT NOT NULL DEFAULT '[]',
  affected_files            TEXT NOT NULL DEFAULT '[]',
  estimated_monthly_savings REAL NOT NULL DEFAULT 0,
  description               TEXT NOT NULL,
  code_fix                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_project_id       ON scans(project_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_project_id   ON endpoints(project_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_scan_id      ON endpoints(scan_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_project_id ON suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_scan_id    ON suggestions(scan_id);
