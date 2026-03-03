import { Hono } from "hono";
import type { AppContext } from "../env";
import { getProvider, listProviders } from "../services/provider-service";
import { buildPaginationMeta, paginate, parsePagination } from "../utils/pagination";

const app = new Hono<AppContext>();

app.get("/providers", (c) => {
  const { page, limit } = parsePagination(c.req.query());
  const data = listProviders();
  return c.json({
    data: paginate(data, page, limit),
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

app.get("/providers/:name", (c) => {
  return c.json({ data: getProvider(c.req.param("name")) });
});

export default app;
