import { Hono } from "hono";
import type { AppContext } from "../env";
import type { MiddlewareHandler } from "hono";
import { requireJwt } from "../middleware/jwt-auth";
import { AppError } from "../utils/app-error";
import {
  signJwt,
  exchangeGoogleCode,
  upsertUser,
  getUserById,
} from "../services/auth-service";

const AUTH_LIMIT = 20;
const AUTH_WINDOW_TTL = 3600; // 1 hour in seconds

const ipRateLimit: MiddlewareHandler<AppContext> = async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const key = `rl:auth:ip:${ip}`;
  const raw = await c.env.KV.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= AUTH_LIMIT) {
    throw new AppError("RATE_LIMITED", `Auth rate limit of ${AUTH_LIMIT} requests/hour exceeded`, 429);
  }
  await c.env.KV.put(key, String(count + 1), raw ? undefined : { expirationTtl: AUTH_WINDOW_TTL });
  return next();
};

const auth = new Hono<AppContext>();

// GET /auth/google — redirect to Google OAuth consent screen
auth.get("/auth/google", ipRateLimit, async (c) => {
  const state = crypto.randomUUID();
  await c.env.KV.put(`oauth:state:${state}`, "1", { expirationTtl: 300 });

  const redirectUri = new URL(c.req.url).origin + "/auth/google/callback";
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
});

// GET /auth/google/callback — handle OAuth callback from Google
auth.get("/auth/google/callback", async (c) => {
  const { code, state, error } = c.req.query();

  if (error) {
    return c.redirect("https://ecoapi.dev/auth/error?reason=denied", 302);
  }

  if (!state || !code) {
    throw new AppError("INVALID_OAUTH_STATE", "Missing OAuth state or code", 400);
  }

  const stored = await c.env.KV.get(`oauth:state:${state}`);
  if (!stored) {
    throw new AppError("INVALID_OAUTH_STATE", "Invalid or expired OAuth state", 400);
  }
  await c.env.KV.delete(`oauth:state:${state}`);

  const redirectUri = new URL(c.req.url).origin + "/auth/google/callback";
  const googleUser = await exchangeGoogleCode(
    code,
    redirectUri,
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET
  );

  const user = await upsertUser(
    c.env.DB,
    googleUser.googleId,
    googleUser.email,
    googleUser.name,
    googleUser.avatarUrl
  );

  const token = await signJwt(user.id, user.email, c.env.JWT_SECRET);

  return c.redirect(`https://ecoapi.dev/dashboard?token=${token}`, 302);
});

// GET /auth/me — return authenticated user's profile
auth.get("/auth/me", requireJwt, async (c) => {
  const userId = c.get("userId")!;
  const user = await getUserById(c.env.DB, userId);
  return c.json({ data: user });
});

// POST /auth/refresh — issue a fresh JWT for the authenticated user
// Requires Content-Type: application/json (due to global middleware); send {} as body
auth.post("/auth/refresh", requireJwt, async (c) => {
  const userId = c.get("userId")!;
  const user = await getUserById(c.env.DB, userId);
  const token = await signJwt(user.id, user.email, c.env.JWT_SECRET);
  return c.json({ data: { token } });
});

export default auth;
