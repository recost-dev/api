# ReCost API

REST API for analyzing codebase API usage, estimating cost, detecting inefficiencies, and generating optimization suggestions.

## Why This Exists

Developers often ship API-heavy features without visibility into:
- Monthly API spend risk
- Redundant or cacheable request patterns
- Rate-limit and N+1 hotspots

ReCost API turns parsed API call data into actionable diagnostics:
- Cost analytics
- Endpoint-level risk/status
- Optimization suggestions with estimated savings
- Graph data for dependency visualization
- **Sustainability stats** — electricity (kWh), water (L), and CO2 (g) footprint estimated from API call volume, with AI vs non-AI breakdown

## Tech Stack

- **Cloudflare Workers** — serverless runtime
- **Hono** — web framework
- **Cloudflare D1** — SQLite database
- **TypeScript** — strict mode

## Setup

1. `npm install`
2. Create D1 database: `npx wrangler d1 create recost-db`
3. Paste the returned `database_id` into `wrangler.toml`
4. Create KV namespace: `npx wrangler kv namespace create rate-limit`
5. Paste the returned `id` and `preview_id` into `wrangler.toml` under `[[kv_namespaces]]`
6. Apply migrations: `npm run db:migrate:local`
7. Start dev server: `npm run dev`

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
  index.ts                # Workers entry point (Hono app)
  env.ts                  # Shared Env/Variables/AppContext types
  config/
    pricing.ts            # Provider pricing & keyword detection
    sustainability.ts     # Energy/water/CO2 constants per provider
  middleware/
    cors.ts
    content-type.ts
    logging.ts
    request-id.ts
    error-handler.ts
    rate-limit.ts         # KV-based scan rate limiting
  models/
    types.ts              # TypeScript domain types
  routes/
    health.ts             # GET /health
    projects.ts           # Projects, scans, endpoints, suggestions, graph, cost, sustainability
    providers.ts          # GET /providers
    chat.ts               # POST /chat (Cloudflare AI / Llama 3.1 8B)
  services/
    analysis-service.ts   # Core analysis engine (pure, sync)
    project-service.ts    # All CRUD via D1 (async)
    provider-service.ts   # Provider config lookups
    validation-service.ts # Input validation
  utils/
    app-error.ts
    pagination.ts
    sort.ts
migrations/
  0001_schema.sql         # D1 table definitions
  0002_seed.sql           # Demo project seed data
wrangler.toml
package.json
tsconfig.json
```

## API

The API is live at **https://api.recost.dev** — no setup required.

Full API documentation is available at **https://recost.dev**.

---

Licensed under the [GNU Affero General Public License v3.0](LICENSE) © 2026 Andres Lopez, Aslan Wang, Donggyu Yoon.
