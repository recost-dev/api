import * as http from "http";
import * as fs from "fs";
import * as path from "path";

import type { EndpointRecord, Suggestion, ScanSummary, GraphData, GraphNode, GraphEdge } from "./analysis/types";

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface LocalServerData {
  endpoints: EndpointRecord[];
  suggestions: Suggestion[];
  summary: ScanSummary | null;
  workspaceName: string;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function makePagination(total: number): PaginationMeta {
  return { page: 1, limit: Math.max(total, 1), total, totalPages: 1, hasNext: false, hasPrev: false };
}

function buildGraph(endpoints: EndpointRecord[], clusterBy = "provider"): GraphData {
  const nodes: GraphNode[] = endpoints.map((ep) => ({
    id: ep.id,
    label: `${ep.method} ${ep.url}`,
    provider: ep.provider,
    monthlyCost: ep.monthlyCost,
    callsPerDay: ep.callsPerDay,
    status: ep.status,
    group: clusterBy === "file" ? (ep.files[0] ?? ep.provider) : ep.provider,
  }));

  const fileToEndpoints = new Map<string, string[]>();
  for (const ep of endpoints) {
    for (const cs of ep.callSites) {
      const list = fileToEndpoints.get(cs.file) ?? [];
      list.push(ep.id);
      fileToEndpoints.set(cs.file, list);
    }
  }

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const epIds of fileToEndpoints.values()) {
    const unique = [...new Set(epIds)];
    for (let i = 0; i < unique.length - 1; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = `${unique[i]}<>${unique[j]}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ source: unique[i], target: unique[j], line: 0 });
        }
      }
    }
  }

  return { nodes, edges };
}

function makeProject(workspaceName: string, endpoints: EndpointRecord[], summary: ScanSummary | null) {
  const now = new Date().toISOString();
  const hasData = endpoints.length > 0;
  return {
    id: "local",
    name: workspaceName,
    createdAt: now,
    updatedAt: now,
    latestScanId: hasData ? "local-scan" : undefined,
    summary: {
      scans: hasData ? 1 : 0,
      endpoints: endpoints.length,
      callsPerDay: summary?.totalCallsPerDay ?? endpoints.reduce((s, ep) => s + ep.callsPerDay, 0),
      monthlyCost: summary?.totalMonthlyCost ?? endpoints.reduce((s, ep) => s + ep.monthlyCost, 0),
    },
  };
}

function makeScan(endpoints: EndpointRecord[], suggestions: Suggestion[], summary: ScanSummary | null) {
  const now = new Date().toISOString();
  return {
    id: "local-scan",
    projectId: "local",
    createdAt: now,
    endpointIds: endpoints.map((ep) => ep.id),
    suggestionIds: suggestions.map((s) => s.id),
    graph: buildGraph(endpoints, "provider"),
    summary: summary ?? {
      totalEndpoints: endpoints.length,
      totalCallsPerDay: endpoints.reduce((s, ep) => s + ep.callsPerDay, 0),
      totalMonthlyCost: endpoints.reduce((s, ep) => s + ep.monthlyCost, 0),
      highRiskCount: suggestions.filter((s) => s.severity === "high").length,
    },
  };
}

export class LocalServer {
  private server: http.Server | null = null;
  private _port = 0;

  constructor(
    private readonly distPath: string,
    private readonly getData: () => LocalServerData,
  ) {}

  get isRunning(): boolean {
    return this.server !== null;
  }

  get port(): number {
    return this._port;
  }

  hasDistFiles(): boolean {
    try {
      return fs.existsSync(path.join(this.distPath, "index.html"));
    } catch {
      return false;
    }
  }

  start(): Promise<number> {
    if (this.server) return Promise.resolve(this._port);

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        this._port = addr.port;
        this.server = server;
        resolve(this._port);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this._port = 0;
    }
  }

  private setCors(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  private sendJson(res: http.ServerResponse, data: unknown): void {
    this.setCors(res);
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify(data));
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsed = new URL(req.url ?? "/", `http://127.0.0.1:${this._port}`);
    const pathname = parsed.pathname;

    if (req.method === "OPTIONS") {
      this.setCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === "/projects" || pathname.startsWith("/projects/")) {
      if (this.handleApiRoute(pathname, parsed.searchParams, res)) return;
    }

    this.serveStatic(pathname, res);
  }

  private handleApiRoute(pathname: string, params: URLSearchParams, res: http.ServerResponse): boolean {
    const { endpoints, suggestions, summary, workspaceName } = this.getData();

    if (pathname === "/projects") {
      this.sendJson(res, {
        data: [makeProject(workspaceName, endpoints, summary)],
        pagination: makePagination(1),
      });
      return true;
    }

    if (pathname === "/projects/local") {
      this.sendJson(res, { data: makeProject(workspaceName, endpoints, summary) });
      return true;
    }

    if (pathname === "/projects/local/scans/latest") {
      this.sendJson(res, { data: makeScan(endpoints, suggestions, summary) });
      return true;
    }

    if (pathname === "/projects/local/endpoints") {
      let filtered = [...endpoints];
      const provider = params.get("provider");
      const status = params.get("status");
      const method = params.get("method");
      if (provider) filtered = filtered.filter((ep) => ep.provider === provider);
      if (status) filtered = filtered.filter((ep) => ep.status === status);
      if (method) filtered = filtered.filter((ep) => ep.method === method);

      const sort = params.get("sort");
      const order = params.get("order") ?? "desc";
      if (sort) {
        // normalize snake_case API sort keys to camelCase field names
        const key = sort === "monthly_cost" ? "monthlyCost" : sort === "calls_per_day" ? "callsPerDay" : sort;
        filtered.sort((a, b) => {
          const va = (a as Record<string, unknown>)[key];
          const vb = (b as Record<string, unknown>)[key];
          if (typeof va === "number" && typeof vb === "number") {
            return order === "asc" ? va - vb : vb - va;
          }
          return order === "asc"
            ? String(va).localeCompare(String(vb))
            : String(vb).localeCompare(String(va));
        });
      }

      this.sendJson(res, { data: filtered, pagination: makePagination(filtered.length) });
      return true;
    }

    if (pathname === "/projects/local/suggestions") {
      let filtered = [...suggestions];
      const type = params.get("type");
      const severity = params.get("severity");
      if (type) filtered = filtered.filter((s) => s.type === type);
      if (severity) filtered = filtered.filter((s) => s.severity === severity);

      const sort = params.get("sort");
      const order = params.get("order") ?? "desc";
      if (sort === "estimated_savings" || sort === "estimatedMonthlySavings") {
        filtered.sort((a, b) =>
          order === "asc"
            ? a.estimatedMonthlySavings - b.estimatedMonthlySavings
            : b.estimatedMonthlySavings - a.estimatedMonthlySavings,
        );
      } else if (sort === "severity") {
        const weight: Record<string, number> = { high: 3, medium: 2, low: 1 };
        filtered.sort((a, b) =>
          order === "asc"
            ? (weight[a.severity] ?? 0) - (weight[b.severity] ?? 0)
            : (weight[b.severity] ?? 0) - (weight[a.severity] ?? 0),
        );
      }

      this.sendJson(res, { data: filtered, pagination: makePagination(filtered.length) });
      return true;
    }

    if (pathname === "/projects/local/graph") {
      const clusterBy = params.get("cluster_by") ?? "provider";
      this.sendJson(res, { data: buildGraph(endpoints, clusterBy) });
      return true;
    }

    if (pathname === "/projects/local/cost") {
      const totalMonthlyCost =
        summary?.totalMonthlyCost ?? endpoints.reduce((s, ep) => s + ep.monthlyCost, 0);
      const totalCallsPerDay =
        summary?.totalCallsPerDay ?? endpoints.reduce((s, ep) => s + ep.callsPerDay, 0);
      this.sendJson(res, {
        data: { totalMonthlyCost, totalCallsPerDay, endpointCount: endpoints.length },
      });
      return true;
    }

    if (pathname === "/projects/local/cost/by-provider") {
      const byProvider = new Map<
        string,
        { provider: string; monthlyCost: number; callsPerDay: number; endpointCount: number }
      >();
      for (const ep of endpoints) {
        const cur = byProvider.get(ep.provider) ?? {
          provider: ep.provider,
          monthlyCost: 0,
          callsPerDay: 0,
          endpointCount: 0,
        };
        cur.monthlyCost += ep.monthlyCost;
        cur.callsPerDay += ep.callsPerDay;
        cur.endpointCount++;
        byProvider.set(ep.provider, cur);
      }
      const providerCosts = [...byProvider.values()].sort((a, b) => b.monthlyCost - a.monthlyCost);
      this.sendJson(res, { data: providerCosts, pagination: makePagination(providerCosts.length) });
      return true;
    }

    return false;
  }

  private serveStatic(pathname: string, res: http.ServerResponse): void {
    const safePath = path.normalize(pathname).replace(/^(\.\.[\\/])+/, "");
    let filePath = path.join(this.distPath, safePath);

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    } catch {
      // File doesn't exist — SPA fallback
      filePath = path.join(this.distPath, "index.html");
    }

    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      this.setCors(res);
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      res.writeHead(200);
      res.end(content);
    } catch {
      this.setCors(res);
      res.writeHead(404);
      res.end("Not found");
    }
  }
}
