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
