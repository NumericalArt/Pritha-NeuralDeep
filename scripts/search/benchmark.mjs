#!/usr/bin/env node
/** Explicit, bounded live evaluation. Never imported by the application. */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { SearchService } from "./service.mjs";
export const cases = [
  ["docs", "Node.js official release documentation", ["nodejs.org"]],
  [
    "docs",
    "Python asyncio TaskGroup official documentation",
    ["docs.python.org"],
  ],
  ["docs", "React useEffect official reference", ["react.dev"]],
  [
    "docs",
    "TypeScript satisfies operator documentation",
    ["typescriptlang.org"],
  ],
  [
    "docs",
    "PostgreSQL transaction isolation documentation",
    ["postgresql.org"],
  ],
  ["docs", "SQLite WAL documentation", ["sqlite.org"]],
  [
    "docs",
    "MCP build server official SDK documentation",
    ["modelcontextprotocol.io"],
  ],
  ["docs", "Next.js route handlers documentation", ["nextjs.org"]],
  ["docs", "Docker compose документация", ["docs.docker.com"]],
  ["docs", "Git rebase официальная документация", ["git-scm.com"]],
  ["current", "Node.js current latest release September 2026", ["nodejs.org"]],
  ["current", "Python latest stable release September 2026", ["python.org"]],
  ["current", "PostgreSQL latest release September 2026", ["postgresql.org"]],
  ["current", "React latest version September 2026", ["react.dev"]],
  [
    "current",
    "Последняя стабильная версия TypeScript сентябрь 2026",
    ["typescriptlang.org"],
  ],
  ["news", "Node.js security releases September 2026", ["nodejs.org"]],
  ["news", "Python release news September 2026", ["python.org"]],
  ["news", "PostgreSQL news September 2026", ["postgresql.org"]],
  ["news", "Новости браузера Firefox сентябрь 2026", ["mozilla.org"]],
  ["news", "Новости Яндекс Облака сентябрь 2026", ["yandex.cloud"]],
  [
    "compare",
    "SQLite PostgreSQL isolation differences",
    ["sqlite.org", "postgresql.org"],
  ],
  [
    "compare",
    "Node.js fetch undici official documentation",
    ["nodejs.org", "undici.nodejs.org"],
  ],
  ["compare", "React useMemo useCallback comparison", ["react.dev"]],
  ["ru", "Yandex Cloud Object Storage документация", ["yandex.cloud"]],
  ["ru", "Документация языка Go эффективное программирование", ["go.dev"]],
  ["ru", "NeuralDeep API поиск документация", ["neuraldeep.ru"]],
  ["ambiguous", "Kimi search API"],
  ["ambiguous", "Модель Qwen для поиска"],
  ["empty", "pritha-evaluation-no-such-product-7c120f9e-20260910"],
  ["empty", "несуществующий-пакет-притха-7c120f9e-20260910"],
].map(([category, query, domains = []], i) => ({
  id: i + 1,
  category,
  query,
  expected: {
    officialDomains: domains,
    top3Required: category === "docs",
    freshness:
      "Never infer current version from a snippet; publication unknown remains unknown",
    emptyAllowed: ["empty", "ambiguous"].includes(category),
  },
}));
if (process.argv.includes("--live")) {
  const stateRoot = process.env.PRITHA_STATE_ROOT,
    codeRoot = process.cwd();
  if (
    !stateRoot ||
    process.env.PRITHA_INSTANCE_ID !== "search-test" ||
    path.resolve(stateRoot) === codeRoot
  )
    throw Error("isolated_search_test_state_required");
  const directory = path.join(stateRoot, "artifacts");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(directory, "benchmark-rubric.json"),
    JSON.stringify(cases, null, 2),
    { mode: 0o600 },
  );
  const service = new SearchService({
      stateRoot: path.join(stateRoot, "benchmark-state"),
      codeRoot,
      instance: "search-test",
    }),
    s = service.store.settings();
  service.configure(
    {
      enabled: true,
      provider: "neuraldeep",
      mode: "requested",
      fallback: false,
      surfaces: { ...s.surfaces, task_chat: true },
      searchCacheMs: 0,
    },
    s.revision,
  );
  const context = {
    surface: "task_chat",
    owner: "live-benchmark",
    turn: "quota",
    explicit: true,
  };
  const diagnostic = await service.diagnose({ kind: "quota" }, context);
  const quota = diagnostic.quota;
  const remaining = (q) =>
    q?.day?.remaining ?? q?.[q?.pool]?.day?.remaining ?? null;
  const results = [];
  let reads = 0,
    stop = null;
  try {
    if (
      !diagnostic.ok ||
      remaining(quota?.search) === null ||
      remaining(quota.search) < cases.length + 20
    )
      stop = "insufficient_verified_search_quota";
    else
      for (const item of cases) {
        const c = { ...context, turn: `benchmark-${Date.now()}-${item.id}` };
        const result = await service.search(
          {
            query: item.query,
            max_results: 5,
            freshness:
              item.category === "current" || item.category === "news"
                ? "current"
                : "any",
          },
          c,
        );
        let read = null;
        if (
          ["current", "news"].includes(item.category) &&
          result.sources.length &&
          reads < 10 &&
          remaining(quota.crawl) > reads + 10
        ) {
          reads++;
          read = await service.readPage(
            { source_id: result.sources[0].id, max_chars: 12000 },
            c,
          );
        }
        const top3 = result.sources
          .slice(0, 3)
          .some((s) =>
            item.expected.officialDomains.some(
              (d) =>
                new URL(s.url).hostname === d ||
                new URL(s.url).hostname.endsWith(`.${d}`),
            ),
          );
        results.push({ case: item, result, read, officialTop3: top3 });
        writeFileSync(
          path.join(directory, "benchmark-live.json"),
          JSON.stringify({ startedQuota: quota, reads, results }, null, 2),
          { mode: 0o600 },
        );
        console.log(
          JSON.stringify({
            id: item.id,
            status: result.status,
            elapsed: result.elapsed_ms,
            officialTop3: top3,
            read: read?.status,
          }),
        );
        if (result.error?.code === "quota_exceeded") {
          stop = "provider_quota_exceeded";
          break;
        }
      }
  } finally {
    const current = service.store.settings();
    service.configure({ enabled: false }, current.revision);
    service.store.close();
  }
  const docs = results.filter((r) => r.case.category === "docs"),
    latencies = results.map((r) => r.result.elapsed_ms).sort((a, b) => a - b);
  const summary = {
    count: results.length,
    reads,
    stop,
    officialTop3Rate: docs.length
      ? docs.filter((r) => r.officialTop3).length / docs.length
      : null,
    p95: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
    defaultAutoEnabled: false,
    qualityGate:
      "Requires source-content review; domain match alone is not usefulness or freshness.",
  };
  writeFileSync(
    path.join(directory, "benchmark-summary.json"),
    JSON.stringify(summary, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(summary));
}
