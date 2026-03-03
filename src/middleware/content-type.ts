import type { MiddlewareHandler } from "hono";
import { AppError } from "../utils/app-error";

const METHODS_REQUIRING_JSON = new Set(["POST", "PATCH"]);

export const requireJsonContentType: MiddlewareHandler = async (c, next) => {
  if (!METHODS_REQUIRING_JSON.has(c.req.method)) {
    await next();
    return;
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError("MISSING_OR_INVALID_CONTENT_TYPE", "Content-Type must be application/json", 400);
  }

  await next();
};
