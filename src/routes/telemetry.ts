import { Hono } from "hono";
import type { AppContext } from "../env";
import { AppError } from "../utils/app-error";
import { validateTelemetryInput } from "../services/validation-service";
import { getAnalytics, getRecentWindows, ingestTelemetry } from "../services/telemetry-service";
import { assertProjectOwnership } from "../utils/project-ownership";

const TELEMETRY_HOURLY_CAP = 1000;

const app = new Hono<AppContext>();

app.post("/projects/:id/telemetry", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("id");
  await assertProjectOwnership(c.env.DB, projectId, userId);

  // Time-windowed cap: 1000 telemetry ingests per project per hour
  const rlKey = `rl:telemetry:${projectId}`;
  const rlRaw = await c.env.KV.get(rlKey);
  const rlCount = rlRaw ? parseInt(rlRaw, 10) : 0;
  if (rlCount >= TELEMETRY_HOURLY_CAP) {
    throw new AppError("RATE_LIMITED", `Telemetry ingest limited to ${TELEMETRY_HOURLY_CAP} per hour per project`, 429);
  }
  await c.env.KV.put(rlKey, String(rlCount + 1), rlRaw ? undefined : { expirationTtl: 3600 });

  const body = await c.req.json().catch(() => {
    throw new AppError("MALFORMED_JSON", "Malformed JSON request body", 400);
  });

  const input = validateTelemetryInput(body);
  const windowId = await ingestTelemetry(c.env.DB, projectId, input);

  return c.json({ status: "accepted", windowId }, 202);
});

app.get("/projects/:id/analytics", async (c) => {
  const userId = c.get("userId")!;
  await assertProjectOwnership(c.env.DB, c.req.param("id"), userId);
  const query = c.req.query();

  if (!query.from || !query.to) {
    throw new AppError("VALIDATION_ERROR", "Query params 'from' and 'to' are required", 422, {
      fields: [
        ...(!query.from ? [{ field: "from", message: "from is required." }] : []),
        ...(!query.to ? [{ field: "to", message: "to is required." }] : [])
      ]
    });
  }

  const fromDate = new Date(query.from);
  const toDate = new Date(query.to);

  if (isNaN(fromDate.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid analytics query params", 422, {
      fields: [{ field: "from", message: "from must be a valid ISO 8601 date string." }]
    });
  }
  if (isNaN(toDate.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid analytics query params", 422, {
      fields: [{ field: "to", message: "to must be a valid ISO 8601 date string." }]
    });
  }
  if (toDate <= fromDate) {
    throw new AppError("VALIDATION_ERROR", "Invalid analytics query params", 422, {
      fields: [{ field: "to", message: "to must be after from." }]
    });
  }

  const interval = query.interval === "window" ? "window" : "day";

  const result = await getAnalytics(c.env.DB, c.req.param("id"), {
    from: query.from,
    to: query.to,
    interval,
    ...(query.environment !== undefined ? { environment: query.environment } : {}),
    ...(query.provider !== undefined ? { provider: query.provider } : {})
  });

  return c.json({ data: result });
});

app.get("/projects/:id/telemetry/recent", async (c) => {
  const userId = c.get("userId")!;
  await assertProjectOwnership(c.env.DB, c.req.param("id"), userId);
  const query = c.req.query();

  const limitRaw = query.limit !== undefined ? Number(query.limit) : 10;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 50) {
    throw new AppError("VALIDATION_ERROR", "Invalid query params", 422, {
      fields: [{ field: "limit", message: "limit must be an integer between 1 and 50." }]
    });
  }

  const windows = await getRecentWindows(c.env.DB, c.req.param("id"), {
    limit: limitRaw,
    ...(query.environment !== undefined ? { environment: query.environment } : {})
  });

  return c.json({ data: windows });
});

export default app;
