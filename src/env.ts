export type Env = {
  DB: D1Database;
  AI: Ai;
  KV: KVNamespace;
  ADMIN_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
};
export type Variables = { requestId: string; userId?: string };
export type AppContext = { Bindings: Env; Variables: Variables };
