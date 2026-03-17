# AUTH — User Accounts & Authentication Context

Persistent context for Claude Code sessions working on the auth feature.
Read this at the start of every auth-related task. Update upon task completion.

---

## Strategy

- **Auth method**: Google OAuth only — no passwords, no `password_hash` column ever
- **API access**: API keys (hashed) for programmatic access
- **Admin flag**: `users.is_admin` (INTEGER 0/1) — no roles table yet

---

## Schema (migrations/0005_users_and_keys.sql)

```
users         id, google_id (unique), email (unique), name, avatar_url,
              is_admin (default 0), created_at
api_keys      id, user_id FK→users CASCADE, key_hash (unique), key_prefix,
              name, last_used_at, created_at
projects      + user_id TEXT nullable FK→users CASCADE  ← added via ALTER
```

Key decisions:
- `projects.user_id` is **nullable** — existing seed data has no owner; a future migration will enforce NOT NULL
- `key_hash` is stored (not the raw key); `key_prefix` is for display (e.g. `eco_abc123...`)
- Index on `api_keys(key_hash)` for fast lookup during request auth
- `api_keys.user_id` FK is `ON DELETE CASCADE` from `users` only — deleting an api_keys row does **not** cascade to projects or telemetry

---

## Seed (migrations/0006_seed_admin.sql)

Local-dev admin: `id = 00000000-0000-0000-0000-000000000100`, `email = admin@local.dev`, `google_id = dev-google-id`, `is_admin = 1`

---

## Migration Numbering

Existing migrations occupy 0001–0004 (0001 schema, 0002 seed, 0003 telemetry, 0004 telemetry indexes).
Auth migrations start at **0005**. Next available: **0007**.

---

## Completed

- Google OAuth flow (callback, session/JWT issuance) — Issue 2
- API key generation/list/revoke endpoints (`POST/GET/DELETE /auth/keys`) — Issue 3

## Pending / Not Yet Built

- Auth middleware (validate Bearer token or API key on incoming requests)
- Enforce `projects.user_id NOT NULL` (future migration after backfill)
