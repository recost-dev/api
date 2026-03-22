import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppContext } from "../env";
import { errorHandler } from "../middleware/error-handler";

// Mock project-service and project-ownership before importing the route
vi.mock("../services/project-service", () => ({
  createScan: vi.fn(),
  createProject: vi.fn(),
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

import { createScan } from "../services/project-service";
import projectRoutes from "../routes/projects";

const STUB_SCAN = {
  id: "scan-1",
  projectId: "proj-1",
  createdAt: "2026-01-01T00:00:00Z",
  endpointIds: [],
  suggestionIds: [],
  graph: { nodes: [], edges: [] },
  summary: { totalEndpoints: 0, totalCallsPerDay: 0, totalMonthlyCost: 0, highRiskCount: 0 }
};

const createTestApp = () => {
  const app = new Hono<AppContext>();
  app.use("*", async (c, next) => {
    c.set("userId", "user-1");
    await next();
  });
  app.route("/", projectRoutes);
  app.onError(errorHandler);
  return app;
};

const MOCK_ENV = { DB: undefined, KV: undefined, AI: undefined };

const postScan = (app: Hono<AppContext>, body: unknown) =>
  app.request(
    "/projects/proj-1/scans",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    MOCK_ENV
  );

const VALID_CALL = {
  file: "src/api.ts",
  line: 10,
  method: "POST",
  url: "https://api.openai.com/v1/chat/completions",
  provider: "openai",
  methodSignature: "chat.completions.create"
};

describe("POST /projects/:id/scans — provider field enforcement", () => {
  beforeEach(() => {
    vi.mocked(createScan).mockResolvedValue(STUB_SCAN as any);
  });

  it("returns 201 with new format (provider + methodSignature)", async () => {
    const app = createTestApp();
    const res = await postScan(app, { apiCalls: [VALID_CALL] });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.data.id).toBe("scan-1");
  });

  it("returns 201 when provider is present but methodSignature is omitted", async () => {
    const app = createTestApp();
    const { methodSignature: _, ...callWithoutSig } = VALID_CALL;
    const res = await postScan(app, { apiCalls: [callWithoutSig] });
    expect(res.status).toBe(201);
  });

  it("returns 400 with upgrade message when provider field is missing", async () => {
    const app = createTestApp();
    const { provider: _, ...callWithoutProvider } = VALID_CALL;
    const res = await postScan(app, { apiCalls: [callWithoutProvider] });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(json.error.message).toContain("Update your extension to the latest version");
  });

  it("returns 400 with upgrade message when provider is an empty string", async () => {
    const app = createTestApp();
    const res = await postScan(app, { apiCalls: [{ ...VALID_CALL, provider: "" }] });
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(json.error.message).toContain("Update your extension to the latest version");
  });

  it("returns 422 when methodSignature exceeds 128 characters", async () => {
    const app = createTestApp();
    const res = await postScan(app, {
      apiCalls: [{ ...VALID_CALL, methodSignature: "a".repeat(129) }]
    });
    expect(res.status).toBe(422);
    const json = await res.json() as any;
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.details.fields[0].message).toContain("128");
  });
});
