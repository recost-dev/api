# ReCost — API Reference

Base URL: `https://api.recost.dev`

---

## Authentication

**User auth** — pass as a Bearer token. Routes marked 🔑 require this. Accepts either:
- A **JWT** obtained via Google OAuth (`GET /auth/google`)
- An **API key** (`rc-<64 hex chars>`) created via `POST /auth/keys`

```
Authorization: Bearer <JWT-or-api-key>
```

The server detects the token type by prefix (`rc-` = API key, anything else = JWT).

Routes marked 🌐 are public.

---

## Auth

### 🌐 `GET /auth/google`
Redirects to Google's OAuth consent screen. Rate limited to 20 requests/IP/hour.

### 🌐 `GET /auth/google/callback`
OAuth callback — handled automatically by Google's redirect. On success, redirects to `https://recost.dev/dashboard?token=<JWT>`. On failure (user denied access), redirects to `https://recost.dev/auth/error?reason=denied` — the frontend must handle this route.

### 🔑 `GET /auth/me`
Returns the authenticated user's profile.

```json
{ "data": { "id": "...", "email": "...", "name": "...", "avatarUrl": "...", "isAdmin": false, "createdAt": "..." } }
```

### 🔑 `POST /auth/refresh`
Issues a fresh 7-day JWT. Send `Content-Type: application/json` with `{}` body. Returns `{ "data": { "token": "<new-JWT>" } }`.

### 🔑 `POST /auth/keys`
Create a new API key. Body: `{ "name": "my-key" }` (string, max 64 chars). Returns `201` with `{ "data": { "id", "key_prefix", "name", "created_at", "key" } }`. The plaintext `key` (format: `rc-<64 hex chars>`) is shown **exactly once** — store it immediately. Max 10 keys per user; returns `409` if exceeded.

### 🔑 `GET /auth/keys`
List all API keys for the authenticated user. Returns `{ "data": [{ "id", "key_prefix", "name", "last_used_at", "created_at" }] }`. The hash and plaintext key are never returned.

### 🔑 `DELETE /auth/keys/:id`
Revoke an API key by ID. Returns `204` on success, `404` if not found or not owned by the authenticated user.

---

## Health

### 🌐 `GET /health`
Check if the API is up.

```bash
curl https://api.recost.dev/health
```

---

## Pricing

### 🌐 `GET /pricing`
Returns current per-method pricing for all supported providers. Used by the VS Code extension to sync pricing data on startup. No auth required. Cached at the edge for 1 hour (`Cache-Control: public, max-age=3600`).

```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-22T00:00:00Z",
  "providers": {
    "openai": {
      "methods": {
        "chat.completions.create": {
          "costModel": "per_token",
          "inputPricePer1m": 2.5,
          "outputPricePer1m": 10.0,
          "notes": "GPT-4o pricing (as of 2025)"
        },
        "embeddings.create": {
          "costModel": "per_token",
          "inputPricePer1m": 0.02,
          "notes": "text-embedding-3-small pricing"
        }
      }
    },
    "stripe": {
      "methods": {
        "paymentIntents.create": {
          "costModel": "per_transaction",
          "fixedFee": 0.3,
          "percentageFee": 2.9,
          "notes": "Standard card processing: $0.30 + 2.9%"
        },
        "customers.create": {
          "costModel": "free",
          "notes": "Creating customers is free"
        }
      }
    }
  }
}
```

Fields `defaultInputTokens`, `defaultOutputTokens`, and `defaultTransactionUsd` are stripped from this response — those are backend-only estimates. The extension uses its own bundled defaults.

---

## Providers

All provider endpoints are public (🌐) — no auth required.

### 🌐 `GET /providers`
List all supported providers with the number of priced methods each has. Supports pagination.

```json
{
  "data": [
    { "name": "openai", "methodCount": 5 },
    { "name": "anthropic", "methodCount": 2 },
    { "name": "stripe", "methodCount": 5 }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 11, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### 🌐 `GET /providers/:name`
Returns full method-level pricing for a provider. `404` if the provider is not in the registry.

```json
{
  "data": {
    "name": "openai",
    "methods": {
      "chat.completions.create": { "costModel": "per_token", "inputPricePer1m": 2.5, "outputPricePer1m": 10.0, "notes": "GPT-4o pricing (as of 2025)" },
      "embeddings.create": { "costModel": "per_token", "inputPricePer1m": 0.02 }
    }
  }
}
```

### 🌐 `GET /providers/:name/methods/:method`
Returns pricing for a single method. `404` if either the provider or the method is not registered.

```json
{
  "data": { "costModel": "per_token", "inputPricePer1m": 2.5, "outputPricePer1m": 10.0, "defaultInputTokens": 500, "defaultOutputTokens": 200, "notes": "GPT-4o pricing (as of 2025)" }
}
```

> **Removed:** `GET /providers/:name` no longer returns a flat `{ name, methods: string[] }` list. It now returns full pricing details. Clients that only need provider names should use `GET /providers`.

---

## Projects

All `/projects/*` routes require user auth (JWT or API key). Projects are scoped to the authenticated user — you can only see and modify your own projects. Admins can see all projects.

### 🔑 `POST /projects`
Create a new project. Auto-assigns to authenticated user. Limits: 20 projects total, 5 creations/hour.

```bash
curl -X POST https://api.recost.dev/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "description": "optional"}'
```

Response: `201` with the created project including its `id`.

---

### 🔑 `GET /projects`
List projects owned by the authenticated user (admins see all).

```bash
curl https://api.recost.dev/projects \
  -H "Authorization: Bearer <token>"
```

---

### 🔑 `GET /projects/:id`
Get a single project. Returns 404 if not owned by the authenticated user.

---

### 🔑 `PATCH /projects/:id`
Update a project's name or description.

```bash
curl -X PATCH https://api.recost.dev/projects/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "new-name"}'
```

---

### 🔑 `DELETE /projects/:id`
Delete a project and all its data.

```bash
curl -X DELETE https://api.recost.dev/projects/<id> \
  -H "Authorization: Bearer <token>"
```

---

## Telemetry (SDK → API)

### 🔑 `POST /projects/:id/telemetry`
Ingest a WindowSummary payload from the SDK. Called automatically by `@recost/node` and `recost` (Python). Pass your API key as the Bearer token. Rate limited to 1000 ingests/hour per project.

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
curl "https://api.recost.dev/projects/<id>/analytics?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z"
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
curl "https://api.recost.dev/projects/<id>/telemetry/recent?limit=20"
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
