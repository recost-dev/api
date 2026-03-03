import type { MiddlewareHandler } from "hono";
import type { Variables } from "../env";

export const requestIdMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
};
