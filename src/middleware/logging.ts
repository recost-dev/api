import type { MiddlewareHandler } from "hono";
import type { Variables } from "../env";

export const requestLoggingMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;
  const requestId = c.get("requestId") ?? "unknown";
  console.log(
    `[${new Date().toISOString()}] ${c.req.method} ${c.req.path} ${c.res.status} ${durationMs}ms requestId=${requestId}`
  );
};
