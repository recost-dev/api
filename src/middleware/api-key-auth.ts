import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { hashApiKey } from "../services/auth-service";
import { AppError } from "../utils/app-error";

export const apiKeyAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const keyHash = await hashApiKey(token);

  const row = await c.env.DB
    .prepare("SELECT id, user_id FROM api_keys WHERE key_hash = ?")
    .bind(keyHash)
    .first<{ id: string; user_id: string }>();

  if (!row) {
    throw new AppError("UNAUTHORIZED", "Invalid API key", 401);
  }

  c.set("userId", row.user_id);

  // Fire-and-forget: update last_used_at without blocking the response
  c.executionCtx.waitUntil(
    c.env.DB
      .prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run()
  );

  await next();
};
