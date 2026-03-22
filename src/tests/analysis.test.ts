import { describe, it, expect } from "vitest";
import { analyzeApiCalls } from "../services/analysis-service";
import type { ApiCallInput } from "../models/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round4 = (v: number) => Number(v.toFixed(4));

const makeCall = (overrides: Partial<ApiCallInput> & { provider: string }): ApiCallInput => ({
  file: "src/api.ts",
  line: 1,
  method: "POST",
  url: "https://example.com/api",
  frequency: "1/day",
  ...overrides
});

// ---------------------------------------------------------------------------
// Cost model: per_token — OpenAI chat.completions.create
// ---------------------------------------------------------------------------

describe("cost model: per_token (OpenAI chat.completions.create)", () => {
  it("computes monthly cost from token pricing at 100 calls/day", () => {
    // costPerCall = (500/1M * 2.5) + (200/1M * 10.0) = 0.00125 + 0.002 = 0.00325
    // monthly     = 0.00325 * 100 * 30 = 9.75
    const result = analyzeApiCalls("p", "s", [
      makeCall({
        provider: "openai",
        methodSignature: "chat.completions.create",
        frequency: "100/day"
      })
    ]);
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].monthlyCost).toBe(9.75);
    expect(result.endpoints[0].methodSignature).toBe("chat.completions.create");
    expect(result.endpoints[0].provider).toBe("openai");
  });
});

// ---------------------------------------------------------------------------
// Cost model: per_transaction — Stripe paymentIntents.create
// ---------------------------------------------------------------------------

describe("cost model: per_transaction (Stripe paymentIntents.create)", () => {
  it("computes monthly cost from fixed + percentage fee at 250 calls/day", () => {
    // costPerCall = 0.30 + (50 * 0.029) = 0.30 + 1.45 = 1.75
    // monthly     = 1.75 * 250 * 30 = 13125
    const result = analyzeApiCalls("p", "s", [
      makeCall({
        provider: "stripe",
        methodSignature: "paymentIntents.create",
        frequency: "250/day"
      })
    ]);
    expect(result.endpoints[0].monthlyCost).toBe(13125);
  });
});

// ---------------------------------------------------------------------------
// Cost model: free — Stripe customers.create
// ---------------------------------------------------------------------------

describe("cost model: free (Stripe customers.create)", () => {
  it("returns $0 monthly cost at 1000 calls/day", () => {
    const result = analyzeApiCalls("p", "s", [
      makeCall({
        provider: "stripe",
        methodSignature: "customers.create",
        frequency: "1000/day"
      })
    ]);
    expect(result.endpoints[0].monthlyCost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cost model: per_request — Supabase from.select
// ---------------------------------------------------------------------------

describe("cost model: per_request (Supabase from.select)", () => {
  it("computes monthly cost at 5000 calls/day", () => {
    // costPerCall = 0.0000012
    // monthly     = 0.0000012 * 5000 * 30 = 0.18
    const result = analyzeApiCalls("p", "s", [
      makeCall({
        provider: "supabase",
        methodSignature: "from.select",
        frequency: "5000/day"
      })
    ]);
    expect(result.endpoints[0].monthlyCost).toBe(0.18);
  });
});

// ---------------------------------------------------------------------------
// Fallback: unknown method on a known provider
// ---------------------------------------------------------------------------

describe("fallback pricing", () => {
  it("uses DEFAULT_PER_REQUEST_COST_USD when method is not in registry", () => {
    // 0.0001 * 100 * 30 = 0.3
    const result = analyzeApiCalls("p", "s", [
      makeCall({
        provider: "openai",
        methodSignature: "nonexistent.method",
        frequency: "100/day"
      })
    ]);
    expect(result.endpoints[0].monthlyCost).toBe(0.3);
  });

  it("uses DEFAULT_PER_REQUEST_COST_USD when provider is not in registry", () => {
    // 0.0001 * 100 * 30 = 0.3
    const result = analyzeApiCalls("p", "s", [
      makeCall({
        provider: "unknown-provider",
        methodSignature: "some.method",
        frequency: "100/day"
      })
    ]);
    expect(result.endpoints[0].monthlyCost).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// parseCallsPerDay: new AST frequency tokens
// ---------------------------------------------------------------------------

describe("parseCallsPerDay: AST scanner frequency tokens", () => {
  // We use a free endpoint so cost = 0, and instead check callsPerDay.
  // For non-free endpoints we pick a method that has a simple cost we can
  // back-calculate from, but it is easier to just check callsPerDay directly.
  // We use an unknown provider so cost = DEFAULT * callsPerDay * 30,
  // allowing us to derive callsPerDay = monthlyCost / (0.0001 * 30).

  const callsPerDayFromResult = (frequency: string) => {
    const result = analyzeApiCalls("p", "s", [
      makeCall({ provider: "x-test-provider", frequency })
    ]);
    return round4(result.endpoints[0].callsPerDay);
  };

  it('"unbounded-loop" → 1000 calls/day', () => {
    expect(callsPerDayFromResult("unbounded-loop")).toBe(1000);
  });

  it('"cache-guarded" → 10 calls/day', () => {
    expect(callsPerDayFromResult("cache-guarded")).toBe(10);
  });

  it('"single" → 1 call/day', () => {
    expect(callsPerDayFromResult("single")).toBe(1);
  });

  it('"bounded-loop" → 100 calls/day', () => {
    expect(callsPerDayFromResult("bounded-loop")).toBe(100);
  });

  it('"parallel" → 500 calls/day', () => {
    expect(callsPerDayFromResult("parallel")).toBe(500);
  });

  it('"polling" → 2880 calls/day', () => {
    expect(callsPerDayFromResult("polling")).toBe(2880);
  });

  it('"conditional" → 50 calls/day', () => {
    expect(callsPerDayFromResult("conditional")).toBe(50);
  });

  it('legacy "per-request" still parses to 1000', () => {
    expect(callsPerDayFromResult("per-request")).toBe(1000);
  });

  it('legacy "daily" still parses to 1', () => {
    expect(callsPerDayFromResult("daily")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Full scan: mixed providers, accurate per-endpoint costs, suggestions intact
// ---------------------------------------------------------------------------

describe("full scan: mixed providers and suggestion integrity", () => {
  // Two openai calls for the same endpoint from different files → redundancy
  // One stripe paymentIntents call → just a cost check
  // The openai endpoint total = 100 + 50 = 150 calls/day → no n+1 (< 1000)
  const CALLS: ApiCallInput[] = [
    {
      file: "src/chat.ts",
      line: 10,
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      provider: "openai",
      methodSignature: "chat.completions.create",
      frequency: "100/day"
    },
    {
      file: "src/assistant.ts",
      line: 22,
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      provider: "openai",
      methodSignature: "chat.completions.create",
      frequency: "50/day"
    },
    {
      file: "src/billing.ts",
      line: 5,
      method: "POST",
      url: "https://api.stripe.com/v1/payment_intents",
      provider: "stripe",
      methodSignature: "paymentIntents.create",
      frequency: "10/day"
    }
  ];

  it("produces two endpoints with correct per-model costs", () => {
    const result = analyzeApiCalls("proj-1", "scan-1", CALLS);
    expect(result.endpoints).toHaveLength(2);

    const openaiEp = result.endpoints.find((e) => e.provider === "openai")!;
    const stripeEp = result.endpoints.find((e) => e.provider === "stripe")!;

    // openai: 0.00325/call * 150 * 30 = 14.625
    expect(openaiEp.callsPerDay).toBe(150);
    expect(openaiEp.monthlyCost).toBe(14.625);
    expect(openaiEp.methodSignature).toBe("chat.completions.create");

    // stripe: 1.75/call * 10 * 30 = 525
    expect(stripeEp.callsPerDay).toBe(10);
    expect(stripeEp.monthlyCost).toBe(525);
    expect(stripeEp.methodSignature).toBe("paymentIntents.create");
  });

  it("fires a redundancy suggestion for the multi-file openai endpoint", () => {
    const result = analyzeApiCalls("proj-1", "scan-1", CALLS);

    const redundancy = result.suggestions.find((s) => s.type === "redundancy");
    expect(redundancy).toBeDefined();
    expect(redundancy!.severity).toBe("medium"); // 2 calls, not > 3
    expect(redundancy!.type).toBe("redundancy");
    expect(redundancy!.affectedEndpoints).toHaveLength(1);
    expect(redundancy!.affectedFiles).toEqual(
      expect.arrayContaining(["src/chat.ts", "src/assistant.ts"])
    );
    // estimatedMonthlySavings = 14.625 * 0.2 = 2.925
    expect(redundancy!.estimatedMonthlySavings).toBe(round4(14.625 * 0.2));
  });

  it("summary totalMonthlyCost sums all endpoints", () => {
    const result = analyzeApiCalls("proj-1", "scan-1", CALLS);
    // 14.625 + 525 = 539.625
    expect(result.summary.totalMonthlyCost).toBe(round4(14.625 + 525));
  });

  it("suggestion fields have correct shape (type, severity, ids, savings)", () => {
    const result = analyzeApiCalls("proj-1", "scan-1", CALLS);
    for (const s of result.suggestions) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.type).toBe("string");
      expect(["high", "medium", "low"]).toContain(s.severity);
      expect(Array.isArray(s.affectedEndpoints)).toBe(true);
      expect(Array.isArray(s.affectedFiles)).toBe(true);
      expect(typeof s.estimatedMonthlySavings).toBe("number");
      expect(typeof s.description).toBe("string");
      expect(typeof s.codeFix).toBe("string");
    }
  });

  it("n+1 suggestion fires when unbounded-loop pushes callsPerDay to 1000", () => {
    const highFreqCalls: ApiCallInput[] = [
      makeCall({
        provider: "openai",
        methodSignature: "chat.completions.create",
        frequency: "unbounded-loop"
      })
    ];
    const result = analyzeApiCalls("p", "s", highFreqCalls);
    const n1 = result.suggestions.find((s) => s.type === "n_plus_one");
    expect(n1).toBeDefined();
    expect(n1!.severity).toBe("high");
  });
});
