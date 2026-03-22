import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { apiKeyAuth } from "./api-key-auth";
import { requireJwt } from "./jwt-auth";

export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (token.startsWith("rc-")) {
    return apiKeyAuth(c, next);
  }

  return requireJwt(c, next);
};
