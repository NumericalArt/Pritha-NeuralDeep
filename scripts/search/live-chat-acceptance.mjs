#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SearchService } from "./service.mjs";
if (
  !process.argv.includes("--live") ||
  process.env.PRITHA_INSTANCE_ID !== "search-test" ||
  !process.env.PRITHA_STATE_ROOT
)
  throw Error("explicit_isolated_live_test_required");
const codeRoot = process.cwd(),
  base = process.env.PRITHA_STATE_ROOT,
  stateRoot = path.join(base, "live-chat-state"),
  workspace = path.join(stateRoot, "workspace");
mkdirSync(workspace, { recursive: true, mode: 0o700 });
const service = new SearchService({
    stateRoot,
    codeRoot,
    instance: "search-test",
  }),
  settings = service.store.settings();
service.configure(
  {
    enabled: true,
    mode: "requested",
    provider: "neuraldeep",
    fallback: false,
    taskSearch: 1,
    taskRead: 1,
    surfaces: { task_chat: true, voice: false, child: false, research: false },
  },
  settings.revision,
);
const results = [];
try {
  for (const model of process.argv.includes("--kimi-only")
    ? ["kimi-k2.6"]
    : ["kimi-k2.6", "qwen3.6-35b-a3b"]) {
    const env = {
      ...process.env,
      PRITHA_STATE_ROOT: stateRoot,
      PRITHA_NEURALDEEP_CODEX_HOME: path.join(stateRoot, "codex-home"),
      CODEX_HOME: path.join(stateRoot, "codex-home"),
      PRITHA_SEARCH_OWNER: `acceptance-${model}`,
      PRITHA_SEARCH_TURN: `turn-${Date.now()}`,
      PRITHA_SEARCH_INTENT: JSON.stringify({
        explicit: true,
        researchExplicit: false,
      }),
      PRITHA_NEURALDEEP_LOCAL_PARALLEL_LIMIT: "1",
    };
    const out = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/neuraldeep-codex.mjs",
          "exec-json",
          "--model",
          model,
          "--effort",
          "low",
          "--sandbox",
          "workspace-write",
          "--cwd",
          workspace,
          "--network",
          "disabled",
          "--ephemeral",
          "--usage-source",
          "codex-chat",
          "--workload-id",
          `search-acceptance-${model}`,
        ],
        { cwd: codeRoot, env, stdio: ["pipe", "pipe", "pipe"] },
      );
      let stdout = "",
        stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), 300000);
      child.stdout.on("data", (d) => {
        stdout += d;
        if (stdout.length > 2000000) child.kill("SIGTERM");
      });
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-6000)));
      child.once("error", reject);
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, stdout, stderr });
      });
      child.stdin.end(
        'Найди официальную документацию React useEffect. Для этого обязательно вызови инструмент pritha_search web_search ровно один раз с query="React useEffect official documentation", domains=["react.dev"]. Не вызывай другие инструменты или shell. Ответь кратко со ссылкой из результата, без утверждения об актуальной версии. Если поиск недоступен, явно сообщи ошибку.',
      );
    });
    const events = out.stdout.split("\n").flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
    const calls = events.filter(
      (e) => e.type === "item.completed" && e.item?.type === "mcp_tool_call",
    );
    const final =
      events
        .filter(
          (e) =>
            e.type === "item.completed" && e.item?.type === "agent_message",
        )
        .at(-1)?.item?.text || "";
    const result = {
      model,
      code: out.code,
      signal: out.signal,
      calls: calls.map((e) => e.item),
      answer: final,
      usage: events.find((e) => e.type === "turn.completed")?.usage,
      errors: events.filter((e) => e.type === "error"),
      stderr: out.stderr,
      ok:
        out.code === 0 &&
        calls.some(
          (e) =>
            e.item.server === "pritha_search" &&
            e.item.tool === "web_search" &&
            e.item.status === "completed",
        ) &&
        /https:\/\/react.dev/.test(final),
    };
    results.push(result);
    console.log(JSON.stringify(result));
    writeFileSync(
      path.join(
        base,
        "artifacts",
        process.argv.includes("--kimi-only")
          ? "live-kimi-retry.json"
          : "live-chat-acceptance.json",
      ),
      JSON.stringify(results, null, 2),
      { mode: 0o600 },
    );
  }
} finally {
  const s = service.store.settings();
  service.configure({ enabled: false }, s.revision);
  service.store.close();
}
if (results.some((r) => !r.ok)) process.exitCode = 1;
