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
Auth migrations start at **0005**. Next available: **0008**.

---

## Built (Issue 2)

**Google OAuth + JWT session** — `src/routes/auth.ts`

| Route | Description |
|---|---|
| `GET /auth/google` | Builds Google OAuth URL, stores CSRF state in KV (`oauth:state:<uuid>`, TTL 300s), redirects. Rate limited 20/IP/hour via `rl:auth:ip:<ip>` KV key. |
| `GET /auth/google/callback` | Validates state (single-use, deleted after check), exchanges code, upserts user, issues JWT, redirects to `https://ecoapi.dev/dashboard?token=<JWT>`. Error → `https://ecoapi.dev/auth/error?reason=denied`. |
| `GET /auth/me` | Returns `{ data: User }` — requires JWT. |
| `POST /auth/refresh` | Returns fresh JWT — requires JWT + `Content-Type: application/json`. |

**JWT** (`src/services/auth-service.ts`, `jose` library):
- Algorithm: HS256, signed with `JWT_SECRET` env var
- Expiry: 7 days
- Payload: `{ sub: userId, email }`
- `verifyJwt` throws `AppError("UNAUTHORIZED", 401)` on any failure

**Middleware** `src/middleware/jwt-auth.ts`:
- Reads `Authorization: Bearer <token>`, calls `verifyJwt`, sets `c.set("userId", payload.sub)`
- Apply per-route: `route.get("/path", requireJwt, handler)`

**Google token exchange**: standard `fetch` POST to `https://oauth2.googleapis.com/token`, decodes `id_token` payload via base64 (no separate userinfo call, no signature verify needed since token received directly from Google).

**User upsert**: `INSERT ... ON CONFLICT(google_id) DO UPDATE SET email, name, avatar_url` — never duplicate rows.

**New env vars** (add to `wrangler.toml [vars]` for dev, `wrangler secret put` for prod):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`

---

## Built (Issue 3)

**API key generation, listing, revocation** — `src/routes/auth.ts`, `src/services/auth-service.ts`

| Route | Description |
|---|---|
| `POST /auth/keys` | Generates `eco-<64 hex>` key via `crypto.getRandomValues`, SHA-256 hashes it (stores hash only), returns plaintext key once. Max 10 keys/user (409 if exceeded). Body: `{ name }`. |
| `GET /auth/keys` | Returns `[{ id, key_prefix, name, last_used_at, created_at }]` — never returns hash or plaintext. |
| `DELETE /auth/keys/:id` | Deletes row with `WHERE id = ? AND user_id = ?` ownership check. 404 if not found. 204 on success. |

Key format: `eco-` + 64 lowercase hex chars (32 random bytes). `key_prefix` = first 8 hex chars of the random part, stored at insert time.

---

## Built (Issue 4)

**API key auth middleware + project scoping** — `src/middleware/api-key-auth.ts`, `src/middleware/require-auth.ts`, `src/utils/project-ownership.ts`

- `requireAuth` middleware (applied to all `/projects/*` in `index.ts`): branches on Bearer token prefix — `eco-` → API key auth, anything else → JWT auth. No sequential fallback.
- `apiKeyAuth`: SHA-256 hashes the token, looks up `api_keys` by `key_hash`, sets `userId` in context. Updates `last_used_at` fire-and-forget via `c.executionCtx.waitUntil()`.
- `assertProjectOwnership(db, projectId, userId)`: checks `users.is_admin = 1` first (admin bypass), then `SELECT id FROM projects WHERE id = ? AND user_id = ?`. Throws 404 (not 403) to avoid leaking project existence. Called at the top of every `/projects/:id/*` handler.
- `listProjects` now requires `userId` (always scopes to owner). Admins bypass in the route handler via `listAllProjects`.
- Rate limits: 20 projects hard cap (D1 count), 5 project creations/hour per user (`rl:projects:create:{userId}` KV), 1000 telemetry ingests/hour per project (`rl:telemetry:{projectId}` KV).
- Migration `0007_seed_projects_admin.sql`: assigns seed projects with `user_id = NULL` to the admin user.

## Pending / Not Yet Built

- Enforce `projects.user_id NOT NULL` (future migration after data backfill is confirmed clean)
