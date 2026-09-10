#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, openSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../../../scripts/lib/env.mjs";
import { resolvePrithaStatePath, resolveTechscopeRoot } from "../../../scripts/lib/paths.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = resolveTechscopeRoot();
loadEnv({ root: ROOT });

const DB_PATH = resolvePrithaStatePath("memory", "techscope.sqlite");
const DEFAULT_MODEL = "gpt-realtime";
const DEFAULT_VOICE = "marin";
const DEFAULT_PORT = 3401;
const DEFAULT_CODEX_TIMEOUT_MS = 300_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_TOOL_TEXT = 8_000;
const CACHE_CONTROL = "no-store, max-age=0, must-revalidate";

function env(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function ftsQuery(value) {
  const normalized = String(value ?? "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || String(value ?? "");
}

function compactText(value, maxChars = MAX_TOOL_TEXT) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function envWithoutProxy(extra = {}) {
  const childEnv = { ...process.env, ...extra };
  if (extra.TECHSCOPE_KEEP_PROXY === "1") return childEnv;
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    delete childEnv[key];
  }
  childEnv.NO_PROXY = childEnv.NO_PROXY || "127.0.0.1,localhost";
  childEnv.no_proxy = childEnv.no_proxy || childEnv.NO_PROXY;
  return childEnv;
}

function sqliteJson(sql) {
  const result = spawnSync("sqlite3", ["-json", DB_PATH, sql], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "sqlite3 failed").trim());
  }
  const output = result.stdout.trim();
  return output ? JSON.parse(output) : [];
}

function memoryStats() {
  return sqliteJson(`
SELECT 'documents' AS name, COUNT(*) AS count FROM documents
UNION ALL SELECT 'chunks', COUNT(*) FROM chunks
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'relations', COUNT(*) FROM relations
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings;
`);
}

function openItems(limit = 8) {
  return sqliteJson(`
SELECT id, type, status, path, title
FROM documents
WHERE status IN ('new', 'draft', 'proposed')
  AND type != 'template'
ORDER BY type, path
LIMIT ${Math.max(1, Math.min(Number(limit) || 8, 30))};
`);
}

function recentItems(limit = 8) {
  return sqliteJson(`
SELECT id, type, status, path, title, updated_at
FROM documents
ORDER BY COALESCE(NULLIF(updated_at, ''), indexed_at) DESC, path
LIMIT ${Math.max(1, Math.min(Number(limit) || 8, 30))};
`);
}

function ftsSearch(query, limit = 6) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 6, 12));
  if (!String(query || "").trim()) return [];
  return sqliteJson(`
SELECT d.id, d.type, d.status, d.path, d.title, c.heading,
       snippet(chunks_fts, 0, '[', ']', ' ... ', 18) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN documents d ON d.id = chunks_fts.document_id
WHERE chunks_fts MATCH ${sqlString(ftsQuery(query))}
ORDER BY rank
LIMIT ${cappedLimit};
`);
}

function semanticSearch(query, limit = 6) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 6, 8));
  if (!String(query || "").trim()) return { ok: true, text: "" };
  const result = spawnSync("python3", ["scripts/semantic-search.py", String(query), "--limit", String(cappedLimit)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: envWithoutProxy({
      TECHSCOPE_KEEP_PROXY: env("TECHSCOPE_VOICE_SEMANTIC_USE_PROXY", "0"),
      HF_HUB_OFFLINE: env("TECHSCOPE_VOICE_SEMANTIC_OFFLINE", "1"),
      TRANSFORMERS_OFFLINE: env("TECHSCOPE_VOICE_SEMANTIC_OFFLINE", "1"),
    }),
    timeout: 120_000,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: "semantic_search_failed",
      detail: compactText(result.stderr || result.stdout || "semantic search failed", 2_000),
    };
  }
  const warning = result.stderr ? compactText(result.stderr, 1_200) : "";
  return {
    ok: true,
    text: compactText(result.stdout, 6_000),
    warning,
  };
}

function findDocument(identifier) {
  const idOrPath = String(identifier || "").trim();
  if (!idOrPath) return null;
  const rows = sqliteJson(`
SELECT id, path, type, status, title, updated_at
FROM documents
WHERE id = ${sqlString(idOrPath)}
   OR path = ${sqlString(idOrPath)}
LIMIT 1;
`);
  return rows[0] || null;
}

async function readArtifact(identifier, maxChars = 8_000) {
  const doc = findDocument(identifier);
  if (!doc) {
    return { ok: false, error: "artifact_not_found", identifier };
  }

  const fullPath = path.resolve(ROOT, doc.path);
  if (!fullPath.startsWith(ROOT + path.sep)) {
    return { ok: false, error: "path_outside_root", path: doc.path };
  }
  const markdown = await readFile(fullPath, "utf8");
  const relations = sqliteJson(`
SELECT relation_type, target_type, target_id
FROM relations
WHERE source_id = ${sqlString(doc.id)}
ORDER BY relation_type, target_type, target_id
LIMIT 40;
`);

  return {
    ok: true,
    document: doc,
    markdown: compactText(markdown, Math.max(500, Math.min(Number(maxChars) || 8_000, 20_000))),
    relations,
  };
}

function privateRoot() {
  return path.resolve(env("TECHSCOPE_VOICE_PRIVATE_ROOT", path.join(ROOT, ".private", "interface-lab", "pritha-voice-control")));
}

async function logPrivateEvent(kind, payload = {}) {
  const root = privateRoot();
  await mkdir(root, { recursive: true });
  await appendFile(
    path.join(root, "events.jsonl"),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      kind,
      ...payload,
    })}\n`,
    "utf8",
  ).catch(() => undefined);
}

function codexMode() {
  const mode = env("TECHSCOPE_VOICE_CODEX_MODE", "queue").toLowerCase();
  return mode === "exec" ? "exec" : "queue";
}

function codexAvailable() {
  const result = spawnSync(env("TECHSCOPE_VOICE_CODEX_BIN", "codex"), ["--version"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  return {
    available: result.status === 0,
    detail: (result.stdout || result.stderr || "").trim(),
  };
}

function codexSandboxForTask(taskType) {
  const override = env("TECHSCOPE_VOICE_CODEX_SANDBOX", "").toLowerCase();
  if (["read-only", "workspace-write", "danger-full-access"].includes(override)) return override;
  if (env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "0") !== "1") return "read-only";
  return taskType === "implementation" || taskType === "system_change" ? "workspace-write" : "read-only";
}

function codexTimeoutMs() {
  const value = Number(env("TECHSCOPE_VOICE_CODEX_TIMEOUT_MS", String(DEFAULT_CODEX_TIMEOUT_MS)));
  return Number.isFinite(value) && value > 0 ? Math.max(10_000, Math.min(value, 3_600_000)) : DEFAULT_CODEX_TIMEOUT_MS;
}

function buildCodexPrompt(task) {
  return [
    "You are the Codex sidecar for the Pritha voice-control experiment.",
    "Work in the current Pritha repository and follow AGENTS.md.",
    "Return a concise non-empty final result for the voice operator. Do not expose secrets.",
    "If the task needs current internet facts, browse or use available network-capable tools through Codex.",
    "For write/system-change requests, make only narrowly scoped changes and report verification.",
    "Do not keep retrying failed shell or network commands. If the same check fails twice, report the failure and stop.",
    "If localhost or a private service is unreachable from the Codex sandbox, report that as a sandbox/network boundary instead of looping.",
    "If the request is unsafe, ambiguous, or impossible, say so and return the smallest useful next step.",
    "",
    "Task payload:",
    JSON.stringify(task, null, 2),
  ].join("\n");
}

async function startCodexExec(task, paths) {
  const codexBin = env("TECHSCOPE_VOICE_CODEX_BIN", "codex");
  const sandbox = codexSandboxForTask(task.task_type);
  const config = ['approval_policy="never"'];
  if (sandbox === "workspace-write") config.push("sandbox_workspace_write.network_access=true");
  if (sandbox === "read-only") config.push("sandbox_read_only.network_access=true");
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "-s",
    sandbox,
    ...config.flatMap((entry) => ["-c", entry]),
    "-C",
    ROOT,
    "-o",
    paths.resultPath,
    "-",
  ];
  const model = env("TECHSCOPE_VOICE_CODEX_MODEL", "");
  if (model) args.splice(1, 0, "-m", model);

  const stdoutFd = openSync(paths.stdoutPath, "a");
  const stderrFd = openSync(paths.stderrPath, "a");
  const timeoutMs = codexTimeoutMs();
  let killedByTimeout = false;
  const child = spawn(codexBin, args, {
    cwd: ROOT,
    env:
      env("TECHSCOPE_VOICE_CODEX_USE_PROXY", "0") === "1"
        ? { ...process.env, TECHSCOPE_ROOT: ROOT }
        : envWithoutProxy({ TECHSCOPE_ROOT: ROOT }),
    stdio: ["pipe", stdoutFd, stderrFd],
  });
  child.stdin.end(buildCodexPrompt(task));
  await writeFile(paths.statusPath, `${JSON.stringify({
    status: "running",
    pid: child.pid,
    sandbox,
    timeout_ms: timeoutMs,
    started_at: new Date().toISOString(),
    result_path: paths.resultPath,
    stdout_path: paths.stdoutPath,
    stderr_path: paths.stderrPath,
  }, null, 2)}\n`, "utf8").catch(() => undefined);
  const timer = setTimeout(() => {
    killedByTimeout = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  }, timeoutMs);
  timer.unref();
  child.on("close", async (code, signal) => {
    clearTimeout(timer);
    const resultText = await readFile(paths.resultPath, "utf8").catch(() => "");
    const hasResult = Boolean(resultText.trim());
    const status = killedByTimeout
      ? "failed_timeout"
      : code === 0 && hasResult
        ? "complete"
        : code === 0
          ? "failed_empty_result"
          : "failed";
    if (status === "failed_empty_result") {
      const stderrText = await readFile(paths.stderrPath, "utf8").catch(() => "");
      const tail = compactText(stderrText.slice(-4_000), 3_000);
      await writeFile(
        paths.resultPath,
        `Codex sidecar exited without a final operator-facing result. See stderr log for the execution transcript.\n\nLast stderr excerpt:\n${tail}\n`,
        "utf8",
      ).catch(() => undefined);
    }
    await writeFile(paths.statusPath, `${JSON.stringify({
      status,
      code,
      signal,
      killed_by_timeout: killedByTimeout,
      completed_at: new Date().toISOString(),
      result_path: paths.resultPath,
      stdout_path: paths.stdoutPath,
      stderr_path: paths.stderrPath,
    }, null, 2)}\n`, "utf8").catch(() => undefined);
  });
  child.unref();
  return {
    pid: child.pid,
    sandbox,
    timeout_ms: timeoutMs,
    result_path: paths.resultPath,
  };
}

async function queueCodexTask(args = {}) {
  const taskText = String(args.task || args.question || "").trim();
  if (!taskText) return { ok: false, error: "missing_task" };

  const now = new Date();
  const taskId = `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const taskDir = path.join(privateRoot(), "codex-tasks", taskId);
  await mkdir(taskDir, { recursive: true });

  const task = {
    id: taskId,
    created_at: now.toISOString(),
    source: "pritha-voice-control",
    status: codexMode() === "exec" ? "running" : "queued",
    task: taskText,
    task_type: String(args.task_type || "analysis"),
    priority: String(args.priority || "normal"),
    requires_internet: Boolean(args.requires_internet),
    expected_result: String(args.expected_result || "concise operator-facing answer"),
    operator_confirmation: String(args.operator_confirmation || ""),
    cwd: ROOT,
  };
  const requestPath = path.join(taskDir, "request.json");
  const promptPath = path.join(taskDir, "prompt.md");
  const statusPath = path.join(taskDir, "status.json");
  const resultPath = path.join(taskDir, "result.md");
  const stdoutPath = path.join(taskDir, "stdout.log");
  const stderrPath = path.join(taskDir, "stderr.log");

  await writeFile(requestPath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
  await writeFile(promptPath, `${buildCodexPrompt(task)}\n`, "utf8");
  await writeFile(statusPath, `${JSON.stringify({ status: task.status, created_at: task.created_at }, null, 2)}\n`, "utf8");

  let exec = null;
  if (codexMode() === "exec") {
    exec = await startCodexExec(task, { resultPath, statusPath, stdoutPath, stderrPath });
  }

  return {
    ok: true,
    task_id: taskId,
    mode: codexMode(),
    request_path: requestPath,
    prompt_path: promptPath,
    status_path: statusPath,
    result_path: resultPath,
    exec,
    operator_note:
      codexMode() === "exec"
        ? "Codex sidecar started. Check status/result paths for completion."
        : "Task captured in private local queue. A foreground Codex thread can pick it up.",
  };
}

export function realtimeTools() {
  return [
    {
      type: "function",
      name: "get_pritha_status",
      description:
        "Read current Pritha memory status, recent artifacts, open draft items, and voice experiment readiness. This is read-only.",
      parameters: {
        type: "object",
        properties: {
          include_open_items: { type: "boolean" },
          limit: { type: "number" },
        },
      },
    },
    {
      type: "function",
      name: "search_pritha_memory",
      description:
        "Search Pritha curated Markdown memory. Use this before answering questions about Pritha standards, decisions, agents, workflows, previous experiments, or stored knowledge. This is read-only.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          search_mode: { type: "string", enum: ["fts", "semantic", "both"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "read_pritha_artifact",
      description:
        "Read one curated Pritha artifact by document id or repository-relative path after memory search found it. This is read-only.",
      parameters: {
        type: "object",
        properties: {
          id_or_path: { type: "string" },
          max_chars: { type: "number" },
        },
        required: ["id_or_path"],
      },
    },
    {
      type: "function",
      name: "queue_codex_task",
      description:
        "Hand off a complex task to Codex in the current Pritha environment. Use for implementation, research with internet access, repo inspection, or deep analysis that should not be done inside the voice model. By default this writes a private task request; if TECHSCOPE_VOICE_CODEX_MODE=exec it starts a local Codex sidecar.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          task_type: {
            type: "string",
            enum: ["analysis", "research", "implementation", "review", "system_change"],
          },
          priority: { type: "string", enum: ["normal", "high"] },
          requires_internet: { type: "boolean" },
          expected_result: { type: "string" },
          operator_confirmation: { type: "string" },
        },
        required: ["task"],
      },
    },
  ];
}

export function buildRealtimeInstructions() {
  return [
    "You are Pritha, a Codex-native agent factory and knowledge assistant.",
    "Speak with the operator in Russian unless they switch language.",
    "This is an experimental voice interface. Keep answers concise and conversational.",
    "Use search_pritha_memory before answering questions about Pritha memory, standards, decisions, workflows, previous agents, or stored project knowledge.",
    "Use read_pritha_artifact when a search result needs exact details.",
    "Use queue_codex_task for implementation, codebase changes, deep repo analysis, or internet/current-source research. If internet is needed, set requires_internet=true; Codex handles the web side.",
    "Do not claim Codex work is complete after queueing or starting a task. Report the task id and status.",
    "Do not ask for secrets, do not expose credentials, and do not attempt publication, deletion, service install, launchd changes, or broad system changes without explicit operator confirmation.",
    "For now, this voice interface may read memory and create private Codex task handoffs; it should not mutate curated Markdown directly.",
  ].join("\n");
}

export function buildRealtimeSessionConfig() {
  return {
    type: "realtime",
    model: env("TECHSCOPE_VOICE_MODEL", env("OPENAI_REALTIME_MODEL", DEFAULT_MODEL)),
    instructions: buildRealtimeInstructions(),
    tool_choice: "auto",
    tools: realtimeTools(),
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad",
        },
        transcription: {
          model: env("TECHSCOPE_VOICE_TRANSCRIPTION_MODEL", "gpt-4o-transcribe"),
        },
      },
      output: {
        voice: env("TECHSCOPE_VOICE_REALTIME_VOICE", env("OPENAI_REALTIME_VOICE", DEFAULT_VOICE)),
      },
    },
  };
}

export async function handleVoiceTool(name, args = {}) {
  await logPrivateEvent("tool_call_started", { name, args });
  let output;
  if (name === "get_pritha_status") {
    output = {
      ok: true,
      memory: memoryStats(),
      recent: recentItems(args.limit),
      open: args.include_open_items === false ? [] : openItems(args.limit),
      voice_experiment: {
        model: buildRealtimeSessionConfig().model,
        voice: buildRealtimeSessionConfig().audio.output.voice,
        codex_mode: codexMode(),
        codex: codexAvailable(),
        private_root: privateRoot(),
      },
    };
    await logPrivateEvent("tool_call_finished", { name, ok: output.ok });
    return output;
  }

  if (name === "search_pritha_memory") {
    const mode = String(args.search_mode || "both");
    const query = String(args.query || "").trim();
    if (!query) {
      output = { ok: false, error: "missing_query" };
      await logPrivateEvent("tool_call_finished", { name, ok: output.ok, error: output.error });
      return output;
    }
    output = {
      ok: true,
      query,
      fts: mode === "semantic" ? [] : ftsSearch(query, args.limit),
      semantic: mode === "fts" ? { ok: true, text: "" } : semanticSearch(query, args.limit),
    };
    await logPrivateEvent("tool_call_finished", {
      name,
      ok: output.ok,
      fts_count: output.fts.length,
      semantic_ok: output.semantic.ok,
      semantic_error: output.semantic.error || "",
    });
    return output;
  }

  if (name === "read_pritha_artifact") {
    output = await readArtifact(args.id_or_path, args.max_chars);
    await logPrivateEvent("tool_call_finished", { name, ok: output.ok, id_or_path: args.id_or_path, error: output.error || "" });
    return output;
  }

  if (name === "queue_codex_task") {
    output = await queueCodexTask(args);
    await logPrivateEvent("tool_call_finished", {
      name,
      ok: output.ok,
      task_id: output.task_id || "",
      mode: output.mode || "",
      error: output.error || "",
    });
    return output;
  }

  output = { ok: false, error: "unknown_tool", name };
  await logPrivateEvent("tool_call_finished", { name, ok: output.ok, error: output.error });
  return output;
}

async function readBody(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, value, status = 200, options = {}) {
  const data = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": CACHE_CONTROL,
  });
  res.end(options.headOnly ? "" : data);
}

function sendText(res, value, status = 200, contentType = "text/plain; charset=utf-8", options = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": CACHE_CONTROL,
  });
  res.end(options.headOnly ? "" : value);
}

async function createRealtimeCall(offerSdp) {
  const apiKey = env("OPENAI_API_KEY", "");
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      text: JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
    };
  }

  const fd = new FormData();
  fd.set("sdp", offerSdp);
  fd.set("session", JSON.stringify(buildRealtimeSessionConfig()));

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

function htmlPage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pritha Voice Control</title>
  <style>
    :root { color-scheme: light; --ink:#172126; --muted:#637179; --line:#d9e0e3; --bg:#f7f8f8; --panel:#fff; --accent:#0b6f5c; --warn:#9b5c00; --bad:#9d2525; }
    * { box-sizing: border-box; }
    body { margin:0; font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--ink); }
    header { padding:16px 18px; background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:2; }
    h1 { margin:0; font-size:21px; }
    main { display:grid; grid-template-columns:minmax(300px, 390px) 1fr; min-height:calc(100vh - 58px); }
    aside, section { padding:16px; }
    aside { border-right:1px solid var(--line); background:#fbfcfc; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:12px; }
    .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    button, input, textarea { font:inherit; border:1px solid var(--line); border-radius:7px; padding:9px 10px; background:#fff; color:var(--ink); }
    button { cursor:pointer; }
    button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
    button.danger { color:#fff; background:var(--bad); border-color:var(--bad); }
    button:disabled { opacity:.55; cursor:not-allowed; }
    textarea { width:100%; min-height:82px; resize:vertical; }
    .status { display:inline-flex; gap:6px; align-items:center; border:1px solid var(--line); border-radius:999px; padding:4px 9px; color:var(--muted); background:#fff; }
    .dot { width:9px; height:9px; border-radius:50%; background:var(--muted); }
    .dot.listening { background:var(--accent); }
    .dot.error { background:var(--bad); }
    .dot.connecting { background:var(--warn); }
    .meta { color:var(--muted); font-size:12px; word-break:break-word; }
    .transcript { display:flex; flex-direction:column; gap:10px; max-width:920px; }
    .turn { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
    .turn.user { border-left:4px solid #607d8b; }
    .turn.assistant { border-left:4px solid var(--accent); }
    .turn.tool { border-left:4px solid var(--warn); }
    pre { white-space:pre-wrap; word-break:break-word; margin:0; font-size:12px; max-height:260px; overflow:auto; }
    @media (max-width: 820px) {
      main { grid-template-columns:1fr; }
      aside { border-right:0; border-bottom:1px solid var(--line); }
      header { position:static; }
      button { min-height:42px; }
    }
  </style>
</head>
<body>
  <header><h1>Pritha Voice Control</h1></header>
  <main>
    <aside>
      <div class="panel">
        <div class="row">
          <span class="status"><span id="dot" class="dot"></span><span id="phase">idle</span></span>
          <span class="meta" id="audio">mic off / remote off</span>
        </div>
        <div class="row" style="margin-top:10px">
          <button id="start" class="primary">Start</button>
          <button id="stop" class="danger" disabled>Stop</button>
          <button id="mute" disabled>Mute</button>
          <button id="statusBtn">Status</button>
        </div>
        <p class="meta" id="settings">Loading settings...</p>
      </div>
      <div class="panel">
        <label class="meta" for="textInput">Text message</label>
        <textarea id="textInput" placeholder="Можно написать, если говорить неудобно"></textarea>
        <div class="row" style="margin-top:8px">
          <button id="sendText" disabled>Send</button>
          <button id="clear">Clear</button>
        </div>
      </div>
      <div class="panel">
        <strong>Tool / Codex Status</strong>
        <pre id="toolStatus">No tool calls yet.</pre>
      </div>
      <audio id="remoteAudio" autoplay></audio>
    </aside>
    <section>
      <div class="transcript" id="transcript">
        <div class="turn assistant">Готово к запуску. Нажми Start, разреши микрофон и говори с Притой.</div>
      </div>
    </section>
  </main>
  <script>
    const el = (id) => document.getElementById(id);
    let pc = null;
    let dc = null;
    let localStream = null;
    let muted = false;
    let assistantDraft = "";
    let responseInProgress = false;
    let responseQueued = false;
    let processingToolBatch = false;
    const handledToolCalls = new Set();
    const pendingToolCalls = new Map();

    function setPhase(phase, detail = "") {
      el("phase").textContent = phase;
      el("dot").className = "dot " + phase;
      if (detail) addTurn("tool", detail);
      el("start").disabled = phase === "connecting" || phase === "listening";
      el("stop").disabled = phase === "idle";
      el("mute").disabled = phase !== "listening";
      el("sendText").disabled = !dc || dc.readyState !== "open";
    }

    function addTurn(role, text) {
      const div = document.createElement("div");
      div.className = "turn " + role;
      div.textContent = text;
      el("transcript").appendChild(div);
      div.scrollIntoView({ block: "end" });
    }

    function setToolStatus(value) {
      el("toolStatus").textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    }

    function requestResponse(reason = "") {
      if (!dc || dc.readyState !== "open") return;
      if (responseInProgress || processingToolBatch) {
        responseQueued = true;
        setToolStatus({ response: "queued", reason, responseInProgress, processingToolBatch });
        return;
      }
      responseInProgress = true;
      dc.send(JSON.stringify({ type: "response.create" }));
    }

    function flushQueuedResponse() {
      if (!responseQueued || responseInProgress || processingToolBatch) return;
      responseQueued = false;
      requestResponse("queued");
    }

    async function loadStatus() {
      const response = await fetch("/api/status");
      const status = await response.json();
      el("settings").textContent = "model=" + status.model + " voice=" + status.voice + " codex=" + status.codex_mode + " key=" + (status.openai_key_configured ? "configured" : "missing");
      setToolStatus(status);
    }

    async function startCall() {
      setPhase("connecting");
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        pc = new RTCPeerConnection();
        pc.onconnectionstatechange = () => {
          if (!pc) return;
          if (pc.connectionState === "connected") setPhase("listening");
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setPhase("error", "Connection lost.");
        };
        pc.ontrack = (event) => {
          el("remoteAudio").srcObject = event.streams[0];
          el("audio").textContent = "mic on / remote on";
        };
        for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream);
        dc = pc.createDataChannel("oai-events");
        dc.onopen = () => {
          setPhase("listening");
          el("sendText").disabled = false;
        };
        dc.onmessage = (event) => handleRealtimeEvent(event.data);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const response = await fetch("/api/realtime/call", {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp || "",
        });
        const answerText = await response.text();
        if (!response.ok) throw new Error(answerText);
        await pc.setRemoteDescription({ type: "answer", sdp: answerText });
      } catch (error) {
        setPhase("error");
        addTurn("tool", error instanceof Error ? error.message : String(error));
        stopCall();
      }
    }

    function stopCall() {
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
      if (dc) dc.close();
      dc = null;
      if (pc) pc.close();
      pc = null;
      muted = false;
      el("mute").textContent = "Mute";
      el("audio").textContent = "mic off / remote off";
      setPhase("idle");
    }

    function toggleMute() {
      if (!localStream) return;
      muted = !muted;
      localStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      el("mute").textContent = muted ? "Unmute" : "Mute";
      el("audio").textContent = muted ? "mic muted / remote on" : "mic on / remote on";
    }

    function sendTextMessage() {
      const text = el("textInput").value.trim();
      if (!text || !dc || dc.readyState !== "open") return;
      dc.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      }));
      requestResponse("text_message");
      addTurn("user", text);
      el("textInput").value = "";
    }

    function rememberToolCall(item) {
      const callKey = item.call_id || item.id || (item.name + ":" + item.arguments);
      if (handledToolCalls.has(callKey) || pendingToolCalls.has(callKey)) return;
      pendingToolCalls.set(callKey, item);
      setToolStatus({ pending_tools: Array.from(pendingToolCalls.values()).map((tool) => tool.name) });
    }

    async function runToolCall(item) {
      let args = {};
      try { args = item.arguments ? JSON.parse(item.arguments) : {}; } catch {}
      const label = item.name + "(" + JSON.stringify(args).slice(0, 240) + ")";
      addTurn("tool", "Tool call: " + label);
      setToolStatus({ running: item.name, args });
      const response = await fetch("/api/realtime/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, arguments: args }),
      });
      const output = await response.json().catch(() => ({ ok: false, error: "tool returned non-json" }));
      setToolStatus(output);
      return output;
    }

    async function processPendingToolCalls() {
      if (processingToolBatch || responseInProgress || !pendingToolCalls.size || !dc || dc.readyState !== "open") return;
      processingToolBatch = true;
      const batch = Array.from(pendingToolCalls.entries());
      pendingToolCalls.clear();
      let sentOutput = false;
      try {
        for (const [callKey, item] of batch) {
          if (handledToolCalls.has(callKey)) continue;
          handledToolCalls.add(callKey);
          const output = await runToolCall(item);
          if (dc && dc.readyState === "open") {
            dc.send(JSON.stringify({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(output) },
            }));
            sentOutput = true;
          }
        }
      } finally {
        processingToolBatch = false;
      }
      if (sentOutput) requestResponse("tool_outputs");
      else flushQueuedResponse();
    }

    function handleRealtimeError(error) {
      const code = error && error.code;
      if (code === "conversation_already_has_active_response") {
        responseInProgress = true;
        responseQueued = true;
        setToolStatus({ error: code, action: "will_retry_after_response_done" });
        return;
      }
      addTurn("tool", JSON.stringify(error || {}));
    }

    function markResponseDone(event) {
      responseInProgress = false;
      if (event.response && Array.isArray(event.response.output)) {
        for (const item of event.response.output) {
          if (item && item.type === "function_call") rememberToolCall(item);
        }
      }
      if (pendingToolCalls.size) processPendingToolCalls();
      else flushQueuedResponse();
    }

    /*
    Realtime may emit function call data before response.done. Do not answer a
    tool call immediately from response.output_item.done: the current response
    can still be active, and response.create would race the protocol.
    */
    function handleToolCallOutput(item) {
      rememberToolCall(item);
      if (dc && dc.readyState === "open") {
        setToolStatus({ pending_tools: Array.from(pendingToolCalls.values()).map((tool) => tool.name) });
      }
    }

    function handleRealtimeEvent(raw) {
      let event = null;
      try { event = JSON.parse(raw); } catch { return; }
      if (event.type === "response.created") {
        responseInProgress = true;
      }
      if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
        addTurn("user", event.transcript);
      }
      if (event.type === "response.audio_transcript.delta" && event.delta) {
        assistantDraft += event.delta;
      }
      if (event.type === "response.audio_transcript.done") {
        const text = event.transcript || assistantDraft;
        assistantDraft = "";
        if (text) addTurn("assistant", text);
      }
      if (event.type === "response.output_text.delta" && event.delta) {
        assistantDraft += event.delta;
      }
      if (event.type === "response.output_text.done") {
        const text = event.text || assistantDraft;
        assistantDraft = "";
        if (text) addTurn("assistant", text);
      }
      if (event.type === "response.output_item.done" && event.item && event.item.type === "function_call") {
        handleToolCallOutput(event.item);
      }
      if (event.type === "response.done") {
        markResponseDone(event);
      }
      if (event.type === "error") {
        handleRealtimeError(event.error || event);
      }
    }

    el("start").onclick = startCall;
    el("stop").onclick = stopCall;
    el("mute").onclick = toggleMute;
    el("sendText").onclick = sendTextMessage;
    el("clear").onclick = () => { el("transcript").innerHTML = ""; };
    el("statusBtn").onclick = loadStatus;
    loadStatus().catch((error) => setToolStatus(String(error)));
  </script>
</body>
</html>`;
}

export function createPrithaVoiceServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
      const isGetLike = req.method === "GET" || req.method === "HEAD";
      const headOnly = req.method === "HEAD";
      if (isGetLike && (url.pathname === "/" || url.pathname === "/voice")) {
        return sendText(res, htmlPage(), 200, "text/html; charset=utf-8", { headOnly });
      }
      if (isGetLike && url.pathname === "/api/health") {
        return sendJson(res, {
          ok: true,
          service: "pritha-voice-control",
          upstream: `http://${env("TECHSCOPE_VOICE_HOST", "127.0.0.1")}:${env("TECHSCOPE_VOICE_PORT", String(DEFAULT_PORT))}`,
          model: buildRealtimeSessionConfig().model,
          openai_key_configured: Boolean(env("OPENAI_API_KEY", "")),
          codex_mode: codexMode(),
          timestamp: new Date().toISOString(),
        }, 200, { headOnly });
      }
      if (isGetLike && url.pathname === "/api/status") {
        const config = buildRealtimeSessionConfig();
        return sendJson(res, {
          ok: true,
          root: ROOT,
          model: config.model,
          voice: config.audio.output.voice,
          tools: config.tools.map((tool) => tool.name),
          openai_key_configured: Boolean(env("OPENAI_API_KEY", "")),
          codex_mode: codexMode(),
          codex: codexAvailable(),
          private_root: privateRoot(),
          memory: existsSync(DB_PATH) ? memoryStats() : [],
        }, 200, { headOnly });
      }
      if (req.method === "POST" && url.pathname === "/api/realtime/call") {
        const offerSdp = await readBody(req);
        const result = await createRealtimeCall(offerSdp);
        return sendText(res, result.text, result.status, result.ok ? "application/sdp" : "application/json; charset=utf-8");
      }
      if (req.method === "POST" && url.pathname === "/api/realtime/tool") {
        const payload = JSON.parse(await readBody(req));
        const output = await handleVoiceTool(payload.name, payload.arguments || {});
        return sendJson(res, output);
      }
      return sendJson(res, { error: "not_found" }, 404);
    } catch (error) {
      return sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });
}

export function startServer() {
  const host = env("TECHSCOPE_VOICE_HOST", "127.0.0.1");
  const port = Number(env("TECHSCOPE_VOICE_PORT", String(DEFAULT_PORT)));
  const server = createPrithaVoiceServer();
  server.listen(port, host, () => {
    console.log(`Pritha Voice Control: http://${host}:${port}`);
    console.log(`Private state: ${privateRoot()}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  startServer();
}
