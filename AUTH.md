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

---

## Seed (migrations/0006_seed_admin.sql)

Local-dev admin: `id = 00000000-0000-0000-0000-000000000100`, `email = admin@local.dev`, `google_id = dev-google-id`, `is_admin = 1`

---

## Migration Numbering

Existing migrations occupy 0001–0004 (0001 schema, 0002 seed, 0003 telemetry, 0004 telemetry indexes).
Auth migrations start at **0005**. Next available: **0007**.

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

## Pending / Not Yet Built

- API key generation endpoint (create/list/revoke)
- Enforce `projects.user_id NOT NULL` (future migration after data backfill)
- Scope project access by `user_id` (currently projects are unscoped after auth)
