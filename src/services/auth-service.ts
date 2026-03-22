import { SignJWT, jwtVerify } from "jose";
import type { User } from "../models/types";
import { AppError, notFound } from "../utils/app-error";

export interface JwtPayload {
  sub: string;
  email: string;
}

interface RawUser {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  is_admin: number;
  created_at: string;
}

function toUser(row: RawUser): User {
  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signJwt(userId: string, email: string, secret: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodeSecret(secret));
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret));
    return { sub: payload.sub as string, email: payload["email"] as string };
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401);
  }
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ googleId: string; email: string; name: string | null; avatarUrl: string | null }> {
  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[auth] Google token exchange failed:", text);
    throw new AppError("OAUTH_ERROR", "Google token exchange failed", 502);
  }

  const data = (await res.json()) as { id_token: string };
  const idToken = data.id_token;

  // Decode the id_token payload (trusted: received directly from Google over HTTPS)
  const [, payloadB64] = idToken.split(".");
  const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(json) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };

  return {
    googleId: claims.sub,
    email: claims.email,
    name: claims.name ?? null,
    avatarUrl: claims.picture ?? null,
  };
}

export async function upsertUser(
  db: D1Database,
  googleId: string,
  email: string,
  name: string | null,
  avatarUrl: string | null
): Promise<User> {
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO users (id, google_id, email, name, avatar_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(google_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         avatar_url = excluded.avatar_url`
    )
    .bind(id, googleId, email, name, avatarUrl)
    .run();

  const row = await db
    .prepare("SELECT * FROM users WHERE google_id = ?")
    .bind(googleId)
    .first<RawUser>();

  if (!row) {
    throw new AppError("DATABASE_ERROR", "Failed to upsert user", 500);
  }

  return toUser(row);
}

export async function getUserById(db: D1Database, id: string): Promise<User> {
  const row = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<RawUser>();

  if (!row) throw notFound("User", id);

  return toUser(row);
}

// ---- API Key helpers ----

interface RawApiKey {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

function generateApiKey(): { key: string; keyPrefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return { key: `rc-${hex}`, keyPrefix: hex.slice(0, 8) };
}

export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function createApiKey(
  db: D1Database,
  userId: string,
  name: string
): Promise<{ id: string; key_prefix: string; name: string; created_at: string; key: string }> {
  const countRow = await db
    .prepare("SELECT COUNT(*) as count FROM api_keys WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();

  if ((countRow?.count ?? 0) >= 10) {
    throw new AppError("KEY_LIMIT_EXCEEDED", "Maximum of 10 API keys per user", 409);
  }

  const { key, keyPrefix } = generateApiKey();
  const keyHash = await hashApiKey(key);
  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, userId, keyHash, keyPrefix, name)
    .run();

  const row = await db
    .prepare("SELECT id, key_prefix, name, last_used_at, created_at FROM api_keys WHERE id = ?")
    .bind(id)
    .first<RawApiKey>();

  if (!row) throw new AppError("DATABASE_ERROR", "Failed to create API key", 500);

  return { id: row.id, key_prefix: row.key_prefix, name: row.name, created_at: row.created_at, key };
}

export async function listApiKeys(
  db: D1Database,
  userId: string
): Promise<Array<{ id: string; key_prefix: string; name: string; last_used_at: string | null; created_at: string }>> {
  const rows = await db
    .prepare(
      "SELECT id, key_prefix, name, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(userId)
    .all<RawApiKey>();

  return rows.results.map(r => ({
    id: r.id,
    key_prefix: r.key_prefix,
    name: r.name,
    last_used_at: r.last_used_at,
    created_at: r.created_at,
  }));
}

export async function deleteApiKey(db: D1Database, userId: string, keyId: string): Promise<void> {
  const result = await db
    .prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
    .bind(keyId, userId)
    .run();

  if (result.meta.changes === 0) throw notFound("ApiKey", keyId);
}
