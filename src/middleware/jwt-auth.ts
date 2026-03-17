import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { verifyJwt } from "../services/auth-service";
import { AppError } from "../utils/app-error";

export const requireJwt: MiddlewareHandler<AppContext> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    throw new AppError("UNAUTHORIZED", "Missing Authorization Bearer token", 401);
  }
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  c.set("userId", payload.sub);
  await next();
};
