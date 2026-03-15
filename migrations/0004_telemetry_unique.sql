-- Add unique index to telemetry_daily to enable INSERT OR REPLACE idempotency
-- in the rollup service, keyed on (project_id, environment, date, provider, endpoint, method).

CREATE UNIQUE INDEX IF NOT EXISTS idx_td_unique
  ON telemetry_daily(project_id, environment, date, provider, endpoint, method);
