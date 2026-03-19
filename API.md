# EcoAPI — API Reference

Base URL: `https://api.ecoapi.dev`

---

## Authentication

**User auth** — pass as a Bearer token. Routes marked 🔑 require this. Accepts either:
- A **JWT** obtained via Google OAuth (`GET /auth/google`)
- An **API key** (`eco-<64 hex chars>`) created via `POST /auth/keys`

```
Authorization: Bearer <JWT-or-api-key>
```

The server detects the token type by prefix (`eco-` = API key, anything else = JWT).

Routes marked 🌐 are public.

---

## Auth

### 🌐 `GET /auth/google`
Redirects to Google's OAuth consent screen. Rate limited to 20 requests/IP/hour.

### 🌐 `GET /auth/google/callback`
OAuth callback — handled automatically by Google's redirect. On success, redirects to `https://ecoapi.dev/dashboard?token=<JWT>`. On failure (user denied access), redirects to `https://ecoapi.dev/auth/error?reason=denied` — the frontend must handle this route.

### 🔑 `GET /auth/me`
Returns the authenticated user's profile.

```json
{ "data": { "id": "...", "email": "...", "name": "...", "avatarUrl": "...", "isAdmin": false, "createdAt": "..." } }
```

### 🔑 `POST /auth/refresh`
Issues a fresh 7-day JWT. Send `Content-Type: application/json` with `{}` body. Returns `{ "data": { "token": "<new-JWT>" } }`.

### 🔑 `POST /auth/keys`
Create a new API key. Body: `{ "name": "my-key" }` (string, max 64 chars). Returns `201` with `{ "data": { "id", "key_prefix", "name", "created_at", "key" } }`. The plaintext `key` (format: `eco-<64 hex chars>`) is shown **exactly once** — store it immediately. Max 10 keys per user; returns `409` if exceeded.

### 🔑 `GET /auth/keys`
List all API keys for the authenticated user. Returns `{ "data": [{ "id", "key_prefix", "name", "last_used_at", "created_at" }] }`. The hash and plaintext key are never returned.

### 🔑 `DELETE /auth/keys/:id`
Revoke an API key by ID. Returns `204` on success, `404` if not found or not owned by the authenticated user.

---

## Health

### 🌐 `GET /health`
Check if the API is up.

```bash
curl https://api.ecoapi.dev/health
```

---

## Projects

All `/projects/*` routes require user auth (JWT or API key). Projects are scoped to the authenticated user — you can only see and modify your own projects. Admins can see all projects.

### 🔑 `POST /projects`
Create a new project. Auto-assigns to authenticated user. Limits: 20 projects total, 5 creations/hour.

```bash
curl -X POST https://api.ecoapi.dev/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "description": "optional"}'
```

Response: `201` with the created project including its `id`.

---

### 🔑 `GET /projects`
List projects owned by the authenticated user (admins see all).

```bash
curl https://api.ecoapi.dev/projects \
  -H "Authorization: Bearer <token>"
```

---

### 🔑 `GET /projects/:id`
Get a single project. Returns 404 if not owned by the authenticated user.

---

### 🔑 `PATCH /projects/:id`
Update a project's name or description.

```bash
curl -X PATCH https://api.ecoapi.dev/projects/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "new-name"}'
```

---

### 🔑 `DELETE /projects/:id`
Delete a project and all its data.

```bash
curl -X DELETE https://api.ecoapi.dev/projects/<id> \
  -H "Authorization: Bearer <token>"
```

---

## Telemetry (SDK → API)

### 🔑 `POST /projects/:id/telemetry`
Ingest a WindowSummary payload from the SDK. Called automatically by `@ecoapi/node` and `ecoapi` (Python). Pass your API key as the Bearer token. Rate limited to 1000 ingests/hour per project.

Returns `202 { "status": "accepted", "windowId": "..." }`.

---

### 🔑 `GET /projects/:id/analytics`
Aggregated usage data for dashboards. Grouped by day by default.

**Query params:**
| Param | Required | Description |
|---|---|---|
| `from` | ✅ | Start datetime, ISO 8601 |
| `to` | ✅ | End datetime, ISO 8601 |
| `interval` | — | `day` (default) or `window` |
| `environment` | — | Filter by environment string |
| `provider` | — | Filter by provider name |

```bash
curl "https://api.ecoapi.dev/projects/<id>/analytics?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z"
```

---

### 🔑 `GET /projects/:id/telemetry/recent`
Raw recent flush windows. Useful for debugging or live feeds.

**Query params:**
| Param | Default | Max |
|---|---|---|
| `limit` | 10 | 50 |
| `environment` | — | — |

```bash
curl "https://api.ecoapi.dev/projects/<id>/telemetry/recent?limit=20"
```

---

## Scans (Static Analysis)

### 🔒 `POST /projects/:id/scans`
Submit a codebase scan for API call detection and cost estimation. Rate limited to 10 per 60 seconds per project.

---

### 🌐 `GET /projects/:id/scans`
List all scans for a project.

### 🌐 `GET /projects/:id/scans/latest`
Get the most recent scan.

### 🌐 `GET /projects/:id/scans/:scanId`
Get a specific scan by ID.

---

## Analysis Results

All require user auth (🔑). Returns 404 if project not owned by authenticated user.

| Endpoint | Description |
|---|---|
| `GET /projects/:id/endpoints` | Detected API endpoints |
| `GET /projects/:id/endpoints/:endpointId` | Single endpoint detail |
| `GET /projects/:id/suggestions` | Optimization suggestions |
| `GET /projects/:id/suggestions/:suggestionId` | Single suggestion |
| `GET /projects/:id/graph` | API call graph |
| `GET /projects/:id/sustainability` | Sustainability stats |
| `GET /projects/:id/cost` | Cost summary |
| `GET /projects/:id/cost/by-provider` | Cost broken down by provider |
| `GET /projects/:id/cost/by-file` | Cost broken down by file |
