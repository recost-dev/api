import { Hono } from "hono";
import type { AppContext } from "../env";

const app = new Hono<AppContext>();
const VERSION = "1.0.0";

app.get("/health", (c) =>
  c.json({
    data: {
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString()
    }
  })
);

export default app;
