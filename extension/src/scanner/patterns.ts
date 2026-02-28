export interface HttpCallMatch {
  method: string;
  url: string;
  library: string;
}

interface PatternDef {
  library: string;
  regex: RegExp;
  methodGroup: number | null;
  urlGroup: number;
  normalizeUrl?: (raw: string) => string;
}

const PATTERN_DEFS: PatternDef[] = [
  {
    library: "fetch",
    regex: /fetch\(\s*['"`]([^'"`\n]+)['"`]\s*,\s*\{[^}]*method:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/gi,
    urlGroup: 1,
    methodGroup: 2,
  },
  {
    library: "fetch",
    regex: /fetch\(\s*['"`]([^'"`\n]+)['"`]/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    library: "fetch",
    regex: /fetch\(\s*`([^`]+)`/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    library: "fetch",
    regex: /fetch\(\s*([A-Za-z_$][\w$.]*)/gi,
    urlGroup: 1,
    methodGroup: null,
    normalizeUrl: (raw) => `<dynamic:${raw}>`,
  },
  {
    library: "axios",
    regex: /axios\.(get|post|put|patch|delete|head|options)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "axios",
    regex: /axios\(\s*['"`]([^'"`\n]+)['"`]/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    library: "axios",
    regex: /axios\(\s*([A-Za-z_$][\w$.]*)/gi,
    methodGroup: null,
    urlGroup: 1,
    normalizeUrl: (raw) => `<dynamic:${raw}>`,
  },
  {
    library: "got",
    regex: /got\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "got",
    regex: /got\(\s*['"`]([^'"`\s]+)['"`]/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    library: "superagent",
    regex: /superagent\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "ky",
    regex: /ky\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "requests",
    regex: /requests\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "requests",
    regex: /requests\.(get|post|put|patch|delete)\(\s*([A-Za-z_][\w.]*)/gi,
    methodGroup: 1,
    urlGroup: 2,
    normalizeUrl: (raw) => `<dynamic:${raw}>`,
  },
  {
    library: "http",
    regex: /http\.(Get|Post|Head)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "HttpClient",
    regex: /(?:this\.)?http\.(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "$http",
    regex: /\$http\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    library: "api-helper",
    regex: /(?:this\.)?(get|post|put|patch|delete)\(\s*['"`](\/[^'"`\n]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
];

const LOOP_KEYWORDS = /\b(for|while|forEach|\.map|\.flatMap|\.reduce)\b/;

export function matchLine(line: string): HttpCallMatch[] {
  const matches: HttpCallMatch[] = [];
  const seen = new Set<string>();

  for (const def of PATTERN_DEFS) {
    def.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = def.regex.exec(line)) !== null) {
      const method = def.methodGroup !== null ? match[def.methodGroup].toUpperCase() : "GET";
      const rawUrl = match[def.urlGroup];
      const url = def.normalizeUrl ? def.normalizeUrl(rawUrl) : rawUrl;
      const key = `${method} ${url}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ method, url, library: def.library });
      }
    }
  }

  return matches;
}

export function matchRouteDefinitionLine(line: string): HttpCallMatch[] {
  const results: HttpCallMatch[] = [];
  const seen = new Set<string>();

  const expressLike = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\n]+)['"`]/gi;
  let expressMatch: RegExpExecArray | null;
  while ((expressMatch = expressLike.exec(line)) !== null) {
    const method = expressMatch[1].toUpperCase();
    const url = expressMatch[2];
    const key = `${method} ${url}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ method, url, library: "route-def" });
    }
  }

  const flaskRoute = /@[\w.]+\.route\(\s*['"`]([^'"`\n]+)['"`]\s*,\s*methods\s*=\s*\[([^\]]+)\]/gi;
  let flaskMatch: RegExpExecArray | null;
  while ((flaskMatch = flaskRoute.exec(line)) !== null) {
    const url = flaskMatch[1];
    const methodsRaw = flaskMatch[2];
    const methods = methodsRaw.match(/[A-Za-z]+/g) ?? ["GET"];
    for (const methodName of methods) {
      const method = methodName.toUpperCase();
      const key = `${method} ${url}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ method, url, library: "route-def" });
      }
    }
  }

  const fastApiRoute = /@[\w.]+\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\n]+)['"`]/gi;
  let fastApiMatch: RegExpExecArray | null;
  while ((fastApiMatch = fastApiRoute.exec(line)) !== null) {
    const method = fastApiMatch[1].toUpperCase();
    const url = fastApiMatch[2];
    const key = `${method} ${url}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ method, url, library: "route-def" });
    }
  }

  return results;
}

export function isInsideLoop(lines: string[], currentIndex: number): boolean {
  const lookback = Math.max(0, currentIndex - 5);
  for (let i = lookback; i < currentIndex; i++) {
    if (LOOP_KEYWORDS.test(lines[i])) {
      return true;
    }
  }
  return false;
}
