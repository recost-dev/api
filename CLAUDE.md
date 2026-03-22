# ReCost - API Usage Analyzer

REST API for analyzing codebase API call patterns, estimating costs, and generating optimization suggestions.

## Tech Stack

- **Cloudflare Workers** — hosting and serverless runtime
- **Hono** — web framework (Workers-compatible, Express-like)
- **Cloudflare D1** — SQLite database (persistent)
- **TypeScript** — strict mode
- **jose** — JWT sign/verify (Web Crypto API, Workers-compatible)

## Setup

1. `npm install`
2. Create D1 database: `npx wrangler d1 create recost-db`
3. Paste the returned `database_id` into `wrangler.toml`
4. Create KV namespace: `npx wrangler kv namespace create rate-limit`
5. Paste the returned `id` and `preview_id` into `wrangler.toml` under `[[kv_namespaces]]`
6. Fill in `wrangler.toml [vars]`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`
7. Apply migrations: `npm run db:migrate:local`
8. Start dev server: `npm run dev`

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server (`wrangler dev`) |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run db:migrate:local` | Apply D1 migrations locally |
| `npm run db:migrate:remote` | Apply D1 migrations to production |

## Project Structure

```
src/
  index.ts            # Workers entry point (Hono app, export default)
  env.ts              # Shared Env/Variables/AppContext types
  config/
    pricing.ts        # METHOD_PRICING registry, computeMonthlyCost(), DEFAULT_PER_REQUEST_COST_USD
    sustainability.ts # Energy/water/CO2 constants per provider
  middleware/
    jwt-auth.ts       # requireJwt (user JWT Bearer token)
    api-key-auth.ts   # apiKeyAuth (rc- prefixed API keys; updates last_used_at via waitUntil)
    require-auth.ts   # requireAuth — combined: rc- prefix → apiKeyAuth, else → requireJwt
    cors.ts / rate-limit.ts / logging.ts / content-type.ts / error-handler.ts / request-id.ts
  models/
    types.ts          # TypeScript domain types (includes User)
  routes/
    auth.ts           # /auth/* — Google OAuth + JWT session + API key CRUD
    pricing.ts        # GET /pricing — public per-method pricing feed for the VS Code extension
    health.ts / projects.ts / providers.ts / chat.ts / telemetry.ts
  services/
    auth-service.ts        # signJwt, verifyJwt, exchangeGoogleCode, upsertUser, getUserById, createApiKey, listApiKeys, deleteApiKey
    analysis-service.ts    # Core analysis engine (pure, sync); uses provider + methodSignature from extension
    project-service.ts     # All CRUD via D1 (async)
    provider-service.ts    # listProviders(), getProviderMethods(), getMethodPricing() — reads METHOD_PRICING
    validation-service.ts / telemetry-service.ts / rollup-service.ts
  utils/              # AppError, pagination, sort helpers, project-ownership.ts
migrations/
  0001_schema.sql     # projects, scans, endpoints, suggestions
  0002_seed.sql       # Demo project seed data
  0003_telemetry.sql  # telemetry_windows, telemetry_metrics
  0004_*              # telemetry indexes
  0005_users_and_keys.sql  # users, api_keys, projects.user_id FK
  0006_seed_admin.sql      # Local dev admin user
  0007_seed_projects_admin.sql  # Assigns user_id=NULL seed projects to admin
wrangler.toml
package.json
tsconfig.json
```

## Architecture Notes

- The D1 database binding (`DB`) flows through `c.env.DB` — passed as the first argument to every service function
- Services are stateless async functions; no module-level state
- JSON columns store arrays/objects (files, callSites, graph, summary, etc.)
- `deleteProject` manually cascades: deletes suggestions → endpoints → scans → project in a `db.batch()`
- `analyzeApiCalls` in `analysis-service.ts` is pure synchronous logic — no DB access. Provider and `methodSignature` come from the extension's fingerprint registry (required in `ApiCallInput`). Cost is computed via `computeMonthlyCost(provider, methodSignature, callsPerDay)` in `config/pricing.ts`.
- `crypto.randomUUID()` is used as a global (no import needed in Workers runtime)
- All `/projects/*` routes are protected by `requireAuth` (applied in `index.ts`). Every `/:id/*` handler calls `assertProjectOwnership(db, projectId, userId)` from `utils/project-ownership.ts` — throws 404 (not 403) if the user doesn't own the project. Admins (`is_admin = 1`) bypass ownership checks.
- `listProjects` always scopes by `userId`. Admins use `listAllProjects` (called in the route handler after checking `user.isAdmin`).
- Hourly cron trigger (`0 * * * *`) calls `runRollup` via a `scheduled` handler in `index.ts` for telemetry aggregation.

## Rate Limiting & Payload Limits

- **Payload cap**: `apiCalls` arrays are capped at 2000 items — enforced in `validation-service.ts`. Returns 422 if exceeded.
- **Scan rate limit**: `POST /projects/:id/scans` — 10/60s per project. KV key: `rl:scan:<projectId>`.
- **Auth rate limit**: `GET /auth/google` — 20/hour per IP. KV key: `rl:auth:ip:<ip>`.
- **Project creation**: hard cap 20/user (D1 count); 5/hour per user. KV key: `rl:projects:create:<userId>`.
- **Telemetry ingest**: 1000/hour per project. KV key: `rl:telemetry:<projectId>`.
- **API key creation**: max 10 keys per user (hard cap in auth-service).
- KV binding name: `KV` (configured in `wrangler.toml` under `[[kv_namespaces]]`)

## D1 Schema

Tables: `projects`, `scans`, `endpoints`, `suggestions`, `telemetry_windows`, `telemetry_metrics`, `telemetry_daily`, `users`, `api_keys`
- See `migrations/` for full schema (0001–0007)
- Numeric costs stored as `REAL`; arrays/objects stored as JSON `TEXT`
- `users`: `id`, `google_id` (unique), `email` (unique), `name`, `avatar_url`, `is_admin` (0/1), `created_at`
- `projects.user_id` FK → `users` (nullable; NOT NULL enforcement is a future migration)
