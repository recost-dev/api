import { Hono } from "hono";
import type { AppContext } from "../env";
import { METHOD_PRICING } from "../config/pricing";

const app = new Hono<AppContext>();

const SCHEMA_VERSION = "1.0.0";
const UPDATED_AT = "2026-03-22T00:00:00Z";

app.get("/pricing", (c) => {
  const providers: Record<string, { methods: Record<string, unknown> }> = {};

  for (const [providerName, methods] of Object.entries(METHOD_PRICING)) {
    const strippedMethods: Record<string, unknown> = {};

    for (const [methodName, pricing] of Object.entries(methods)) {
      const { costModel, inputPricePer1m, outputPricePer1m, fixedFee, percentageFee, perRequestCostUsd, notes } = pricing;

      const entry: Record<string, unknown> = { costModel };
      if (inputPricePer1m !== undefined) entry.inputPricePer1m = inputPricePer1m;
      if (outputPricePer1m !== undefined && outputPricePer1m !== 0) entry.outputPricePer1m = outputPricePer1m;
      if (fixedFee !== undefined) entry.fixedFee = fixedFee;
      if (percentageFee !== undefined) entry.percentageFee = percentageFee;
      if (perRequestCostUsd !== undefined) entry.perRequestCostUsd = perRequestCostUsd;
      if (notes !== undefined) entry.notes = notes;

      strippedMethods[methodName] = entry;
    }

    providers[providerName] = { methods: strippedMethods };
  }

  c.header("Cache-Control", "public, max-age=3600");

  return c.json({
    schemaVersion: SCHEMA_VERSION,
    updatedAt: UPDATED_AT,
    providers
  });
});

export default app;
