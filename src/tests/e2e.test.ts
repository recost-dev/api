/**
 * End-to-end route tests.
 *
 * Strategy: all DB-backed service calls are mocked. The real analysis
 * engine (analyzeApiCalls) and pricing logic (computeMonthlyCost) run
 * unmodified — we compute expected values from them in test setup so
 * assertions are always derived from the same source of truth.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { Hono } from "hono";
import type { AppContext } from "../env";
import { errorHandler } from "../middleware/error-handler";
import { analyzeApiCalls } from "../services/analysis-service";
import type { ApiCallInput, Scan } from "../models/types";

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../services/project-service", () => ({
  createProject: vi.fn(),
  createScan: vi.fn(),
  deleteProject: vi.fn(),
  getProjectWithSummary: vi.fn(),
  getCostBreakdownByFile: vi.fn(),
  getCostBreakdownByProvider: vi.fn(),
  getCostSummary: vi.fn(),
  getEndpoint: vi.fn(),
  getGraph: vi.fn(),
  getLatestScan: vi.fn(),
  getScan: vi.fn(),
  getSuggestion: vi.fn(),
  getSustainabilityStats: vi.fn(),
  listAllProjects: vi.fn(),
  listLatestEndpoints: vi.fn(),
  listLatestSuggestions: vi.fn(),
  listProjects: vi.fn(),
  listScans: vi.fn(),
  patchProject: vi.fn()
}));

vi.mock("../utils/project-ownership", () => ({
  assertProjectOwnership: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../services/auth-service", () => ({
  getUserById: vi.fn(),
  signJwt: vi.fn(),
  verifyJwt: vi.fn(),
  hashApiKey: vi.fn(),
  createApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  deleteApiKey: vi.fn(),
  exchangeGoogleCode: vi.fn(),
  upsertUser: vi.fn()
}));

import {
  createScan,
  getCostBreakdownByProvider,
  getCostSummary,
  listLatestEndpoints,
  listLatestSuggestions
} from "../services/project-service";

import projectRoutes from "../routes/projects";
import providerRoutes from "../routes/providers";
import pricingRoutes from "../routes/pricing";

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

const MOCK_ENV = { DB: undefined, KV: undefined, AI: undefined };

const createTestApp = () => {
  const app = new Hono<AppContext>();
  app.use("*", async (c, next) => {
    c.set("userId", "user-1");
    await next();
  });
  app.route("/", projectRoutes);
  app.route("/", providerRoutes);
  app.route("/", pricingRoutes);
  app.onError(errorHandler);
  return app;
};

const get = (app: Hono<AppContext>, path: string) =>
  app.request(path, { method: "GET" }, MOCK_ENV);

const post = (app: Hono<AppContext>, path: string, body: unknown) =>
  app.request(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    MOCK_ENV
  );

// ---------------------------------------------------------------------------
// Lifecycle test data — computed once from the real analysis engine
// ---------------------------------------------------------------------------

const PROJECT_ID = "proj-e2e";
const SCAN_ID = "scan-e2e";

// Calls designed to trigger: redundancy, n+1, rate-limit, batch
const LIFECYCLE_CALLS: ApiCallInput[] = [
  // openai: 2 files → redundancy; 1000 + 100 = 1100/day → n+1 + rate_limit
  { file: "src/chat.ts", line: 10, method: "POST", url: "https://api.openai.com/chat", provider: "openai", methodSignature: "chat.completions.create", frequency: "unbounded-loop" },
  { file: "src/assistant.ts", line: 5, method: "POST", url: "https://api.openai.com/chat", provider: "openai", methodSignature: "chat.completions.create", frequency: "100/day" },
  // stripe
  { file: "src/billing.ts", line: 10, method: "POST", url: "https://api.stripe.com/v1/payment_intents", provider: "stripe", methodSignature: "paymentIntents.create", frequency: "10/day" },
  // supabase pair in same file at nearby lines → batch
  { file: "src/db.ts", line: 20, method: "GET", url: "https://db.supabase.co/rest/users", provider: "supabase", methodSignature: "from.select", frequency: "50/day" },
  { file: "src/db.ts", line: 25, method: "POST", url: "https://db.supabase.co/rest/users/profiles", provider: "supabase", methodSignature: "from.insert", frequency: "50/day" }
];

// Run real analysis once to derive all expected values
const ANALYSIS = analyzeApiCalls(PROJECT_ID, SCAN_ID, LIFECYCLE_CALLS);

const MOCK_SCAN: Scan = {
  id: SCAN_ID,
  projectId: PROJECT_ID,
  createdAt: "2026-01-01T00:00:00Z",
  endpointIds: ANALYSIS.endpoints.map((e) => e.id),
  suggestionIds: ANALYSIS.suggestions.map((s) => s.id),
  graph: ANALYSIS.graph,
  summary: ANALYSIS.summary
};

// Pre-compute cost summary and breakdown the same way getCostSummary/getCostBreakdownByProvider do
const COST_SUMMARY = {
  totalMonthlyCost: Number(ANALYSIS.endpoints.reduce((s, e) => s + e.monthlyCost, 0).toFixed(4)),
  totalCallsPerDay: Number(ANALYSIS.endpoints.reduce((s, e) => s + e.callsPerDay, 0).toFixed(2)),
  endpointCount: ANALYSIS.endpoints.length
};

const providerMap = new Map<string, { monthlyCost: number; callsPerDay: number; endpointCount: number }>();
for (const ep of ANALYSIS.endpoints) {
  const cur = providerMap.get(ep.provider) ?? { monthlyCost: 0, callsPerDay: 0, endpointCount: 0 };
  cur.monthlyCost += ep.monthlyCost;
  cur.callsPerDay += ep.callsPerDay;
  cur.endpointCount += 1;
  providerMap.set(ep.provider, cur);
}
const COST_BY_PROVIDER = Array.from(providerMap.entries()).map(([provider, v]) => ({
  provider,
  monthlyCost: Number(v.monthlyCost.toFixed(4)),
  callsPerDay: Number(v.callsPerDay.toFixed(2)),
  endpointCount: v.endpointCount
}));

// ---------------------------------------------------------------------------
// GET /pricing
// ---------------------------------------------------------------------------

describe("GET /pricing", () => {
  it("returns 200 with schemaVersion and providers map", async () => {
    const app = createTestApp();
    const res = await get(app, "/pricing");
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.schemaVersion).toBe("1.0.0");
    expect(typeof json.providers).toBe("object");
  });

  it("every method entry has a costModel field", async () => {
    const app = createTestApp();
    const res = await get(app, "/pricing");
    const json = await res.json() as any;
    for (const [, providerData] of Object.entries(json.providers) as any) {
      for (const [, method] of Object.entries(providerData.methods) as any) {
        expect(["per_token", "per_transaction", "per_request", "free"]).toContain(method.costModel);
      }
    }
  });

  it("does not expose defaultInputTokens, defaultOutputTokens, or defaultTransactionUsd", async () => {
    const app = createTestApp();
    const res = await get(app, "/pricing");
    const raw = await res.text();
    expect(raw).not.toContain("defaultInputTokens");
    expect(raw).not.toContain("defaultOutputTokens");
    expect(raw).not.toContain("defaultTransactionUsd");
  });

  it("includes all expected providers", async () => {
    const app = createTestApp();
    const res = await get(app, "/pricing");
    const json = await res.json() as any;
    const providerNames = Object.keys(json.providers);
    expect(providerNames).toContain("openai");
    expect(providerNames).toContain("anthropic");
    expect(providerNames).toContain("stripe");
    expect(providerNames).toContain("supabase");
    expect(providerNames).toContain("twilio");
  });
});

// ---------------------------------------------------------------------------
// GET /providers
// ---------------------------------------------------------------------------

describe("GET /providers", () => {
  it("returns list of providers with methodCount", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers");
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(Array.isArray(json.data)).toBe(true);
    for (const entry of json.data) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.methodCount).toBe("number");
      expect(entry.methodCount).toBeGreaterThan(0);
    }
  });

  it("includes openai with correct method count", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers");
    const json = await res.json() as any;
    const openai = json.data.find((p: any) => p.name === "openai");
    expect(openai).toBeDefined();
    expect(openai.methodCount).toBe(5); // chat, responses, embeddings, images, audio
  });
});

// ---------------------------------------------------------------------------
// GET /providers/:name
// ---------------------------------------------------------------------------

describe("GET /providers/:name", () => {
  it("returns method pricing map for a known provider", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers/openai");
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.name).toBe("openai");
    expect(typeof json.data.methods).toBe("object");
    expect(json.data.methods["chat.completions.create"]).toBeDefined();
    expect(json.data.methods["chat.completions.create"].costModel).toBe("per_token");
  });

  it("returns 404 for an unknown provider", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers/nonexistent-provider");
    expect(res.status).toBe(404);
    const json = await res.json() as any;
    expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// GET /providers/:name/methods/:method
// ---------------------------------------------------------------------------

describe("GET /providers/:name/methods/:method", () => {
  it("returns specific method pricing for openai chat.completions.create", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers/openai/methods/chat.completions.create");
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.costModel).toBe("per_token");
    expect(json.data.inputPricePer1M).toBe(2.5);
    expect(json.data.outputPricePer1M).toBe(10.0);
  });

  it("returns specific method pricing for stripe paymentIntents.create", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers/stripe/methods/paymentIntents.create");
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.costModel).toBe("per_transaction");
    expect(json.data.fixedFee).toBe(0.3);
    expect(json.data.percentageFee).toBe(0.029);
  });

  it("returns 404 for a method not in registry", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers/openai/methods/nonexistent.method");
    expect(res.status).toBe(404);
  });

  it("returns 404 when provider itself doesn't exist", async () => {
    const app = createTestApp();
    const res = await get(app, "/providers/ghost/methods/some.method");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full scan lifecycle
// ---------------------------------------------------------------------------

describe("full scan lifecycle", () => {
  let app: Hono<AppContext>;

  beforeAll(() => {
    app = createTestApp();
    vi.mocked(createScan).mockResolvedValue(MOCK_SCAN);
    vi.mocked(listLatestEndpoints).mockResolvedValue(ANALYSIS.endpoints);
    vi.mocked(getCostSummary).mockResolvedValue(COST_SUMMARY);
    vi.mocked(getCostBreakdownByProvider).mockResolvedValue(COST_BY_PROVIDER);
    vi.mocked(listLatestSuggestions).mockResolvedValue(ANALYSIS.suggestions);
  });

  it("POST /scans returns 201 with scan summary", async () => {
    const res = await post(app, `/projects/${PROJECT_ID}/scans`, { apiCalls: LIFECYCLE_CALLS });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.data.id).toBe(SCAN_ID);
    expect(json.data.summary.totalEndpoints).toBe(ANALYSIS.endpoints.length);
  });

  it("GET /endpoints returns per-method costs from real pricing engine", async () => {
    const res = await get(app, `/projects/${PROJECT_ID}/endpoints`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;

    const openaiEp = json.data.find((e: any) => e.provider === "openai");
    const stripeEp = json.data.find((e: any) => e.provider === "stripe");
    const supabaseEps = json.data.filter((e: any) => e.provider === "supabase");

    // openai: (500/1M*2.5 + 200/1M*10) * 1100 * 30 = 0.00325 * 1100 * 30 = 107.25
    expect(openaiEp.monthlyCost).toBe(107.25);
    expect(openaiEp.callsPerDay).toBe(1100);
    expect(openaiEp.methodSignature).toBe("chat.completions.create");

    // stripe: (0.30 + 50*0.029) * 10 * 30 = 1.75 * 300 = 525
    expect(stripeEp.monthlyCost).toBe(525);

    // supabase: both endpoints present
    expect(supabaseEps).toHaveLength(2);
  });

  it("GET /cost returns correct total from per-method pricing", async () => {
    const res = await get(app, `/projects/${PROJECT_ID}/cost`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.totalMonthlyCost).toBe(COST_SUMMARY.totalMonthlyCost);
    expect(json.data.endpointCount).toBe(ANALYSIS.endpoints.length);
  });

  it("GET /cost/by-provider groups costs correctly", async () => {
    const res = await get(app, `/projects/${PROJECT_ID}/cost/by-provider`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    const openaiEntry = json.data.find((e: any) => e.provider === "openai");
    const stripeEntry = json.data.find((e: any) => e.provider === "stripe");
    expect(openaiEntry.monthlyCost).toBe(107.25);
    expect(stripeEntry.monthlyCost).toBe(525);
  });

  it("GET /suggestions returns all suggestion types with correct structure", async () => {
    const res = await get(app, `/projects/${PROJECT_ID}/suggestions`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    const types = json.data.map((s: any) => s.type);
    expect(types).toContain("redundancy");
    expect(types).toContain("n_plus_one");
    expect(types).toContain("rate_limit");
    expect(types).toContain("batch");
  });

  it("GET /suggestions — n+1 suggestion is high severity and references the openai endpoint", async () => {
    const res = await get(app, `/projects/${PROJECT_ID}/suggestions`);
    const json = await res.json() as any;
    const n1 = json.data.find((s: any) => s.type === "n_plus_one");
    expect(n1.severity).toBe("high");
    expect(n1.affectedEndpoints).toHaveLength(1);
    expect(n1.estimatedMonthlySavings).toBe(Number((107.25 * 0.4).toFixed(4)));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("scan with known provider but unregistered method falls back to default cost", () => {
    const calls: ApiCallInput[] = [
      { file: "src/a.ts", line: 1, method: "POST", url: "https://api.openai.com/x", provider: "openai", methodSignature: "unregistered.method", frequency: "100/day" }
    ];
    const result = analyzeApiCalls("p", "s", calls);
    // falls back to DEFAULT_PER_REQUEST_COST_USD = 0.0001 * 100 * 30 = 0.3
    expect(result.endpoints[0].monthlyCost).toBe(0.3);
    expect(result.endpoints).toHaveLength(1); // no crash
  });

  it("scan with all free-tier calls returns total cost of $0", () => {
    const calls: ApiCallInput[] = [
      { file: "src/a.ts", line: 1, method: "POST", url: "https://api.stripe.com/customers", provider: "stripe", methodSignature: "customers.create", frequency: "1000/day" },
      { file: "src/b.ts", line: 1, method: "GET", url: "https://api.stripe.com/customers/list", provider: "stripe", methodSignature: "customers.list", frequency: "500/day" }
    ];
    const result = analyzeApiCalls("p", "s", calls);
    expect(result.summary.totalMonthlyCost).toBe(0);
    expect(result.endpoints.every((e) => e.monthlyCost === 0)).toBe(true);
  });

  it("scan with 0 calls per day produces $0 cost and no division errors", () => {
    const calls: ApiCallInput[] = [
      { file: "src/a.ts", line: 1, method: "POST", url: "https://api.openai.com/chat", provider: "openai", methodSignature: "chat.completions.create", frequency: "0" }
    ];
    const result = analyzeApiCalls("p", "s", calls);
    expect(result.endpoints[0].monthlyCost).toBe(0);
    expect(result.endpoints[0].callsPerDay).toBe(0);
    expect(result.summary.totalMonthlyCost).toBe(0);
  });
});
