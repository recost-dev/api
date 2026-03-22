import { Hono } from "hono";
import type { AppContext } from "../env";
import { getMethodPricing, getProviderMethods, listProviders } from "../services/provider-service";
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

app.get("/providers/:name/methods/:method", (c) => {
  const pricing = getMethodPricing(c.req.param("name"), c.req.param("method"));
  return c.json({ data: pricing });
});

app.get("/providers/:name", (c) => {
  const name = c.req.param("name");
  const methods = getProviderMethods(name);
  return c.json({ data: { name, methods } });
});

export default app;
