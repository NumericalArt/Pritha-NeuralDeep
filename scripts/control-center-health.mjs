#!/usr/bin/env node
import { parseLongArgsWithEquals as parseArgs } from "./lib/cli-args.mjs";

import process from "node:process";

const DEFAULT_PAGES = ["/voice", "/agents", "/task-chat", "/codex", "/settings"];

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeBaseUrl(options) {
  if (options["base-url"]) return String(options["base-url"]).replace(/\/+$/, "");
  const host = String(options.host || process.env.PRITHA_CONTROL_CENTER_HOST || "127.0.0.1");
  const port = Number(options.port || process.env.PRITHA_CONTROL_CENTER_PORT || 3420);
  return `http://${host}:${port}`;
}

function normalizePages(options) {
  const pageArgs = asArray(options.page).flatMap((item) => String(item).split(","));
  const pages = pageArgs.length > 0 ? pageArgs : DEFAULT_PAGES;
  return pages.map((page) => (page.startsWith("/") ? page : `/${page}`));
}

function compact(value, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
}

async function fetchTextOnce(url, timeoutMs) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "text/html,application/javascript,application/json,text/plain,*/*" },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      text: "",
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isTransientFailure(result) {
  return result.status === 0 || [502, 503, 504].includes(result.status);
}

async function fetchText(url, timeoutMs, retries = 0) {
  let result = await fetchTextOnce(url, timeoutMs);
  for (let attempt = 0; attempt < retries && isTransientFailure(result); attempt += 1) {
    result = await fetchTextOnce(url, Math.min(timeoutMs, 2000));
  }
  return result;
}

function extractScriptUrls(html, pageUrl, baseOrigin) {
  const scripts = [];
  const pattern = /<script\b[^>]*\bsrc=(["'])(.*?)\1/giu;
  for (const match of html.matchAll(pattern)) {
    const raw = match[2].replaceAll("&amp;", "&");
    try {
      const url = new URL(raw, pageUrl);
      if (url.origin === baseOrigin && url.pathname.endsWith(".js")) {
        scripts.push(url.href);
      }
    } catch {
      // Ignore malformed src values; the page fetch check will still report the
      // rendered HTML route status.
    }
  }
  return [...new Set(scripts)];
}

function check(status, id, message, detail = {}) {
  return { id, status, message, ...detail };
}

function summarizeStatus(checks, skipped) {
  if (skipped) return "skipped";
  if (checks.some((item) => item.status === "fail")) return "fail";
  if (checks.some((item) => item.status === "warn")) return "pass-with-warnings";
  return "pass";
}

async function runHealthcheck(options) {
  const baseUrl = normalizeBaseUrl(options);
  const base = new URL(baseUrl);
  const timeoutMs = Number(options["timeout-ms"] || 8000);
  const retries = Math.min(1, Math.max(0, Number(options.retries || 0)));
  const strict = Boolean(options.strict);
  const pages = normalizePages(options);
  const checks = [];
  const pageResults = [];
  const chunkResults = [];

  const healthUrl = new URL("/api/health", base).href;
  const health = await fetchText(healthUrl, timeoutMs, retries);
  if (!health.ok) {
    const skipped = health.status === 0 && !strict;
    checks.push(check(
      skipped ? "skip" : "fail",
      "control-center-reachable",
      skipped
        ? "Control Center is not running; live UI chunk check skipped"
        : "Control Center health endpoint is not healthy",
      {
        url: healthUrl,
        httpStatus: health.status,
        detail: compact(health.error || health.text || health.contentType),
      },
    ));
    return {
      schema: "pritha-control-center-health-v1",
      baseUrl,
      created_at: new Date().toISOString(),
      strict,
      status: skipped ? "skipped" : "fail",
      checks,
      pages: pageResults,
      chunks: chunkResults,
    };
  }

  checks.push(check("pass", "control-center-reachable", "Control Center health endpoint is ready", {
    url: healthUrl,
    httpStatus: health.status,
  }));

  let healthPayload = null;
  try { healthPayload = JSON.parse(health.text); } catch { /* contract check below */ }
  const expectedInstance = String(process.env.PRITHA_INSTANCE_ID || "").trim();
  const expectedPort = Number(process.env.PRITHA_CONTROL_CENTER_PORT || base.port || 0);
  const healthContractValid = healthPayload?.schema === "pritha-control-center-health-v2"
    && healthPayload?.ok === true
    && healthPayload?.service === "pritha-control-center"
    && healthPayload?.status === "ready"
    && typeof healthPayload?.instance?.id === "string"
    && Number.isSafeInteger(healthPayload?.instance?.port)
    && typeof healthPayload?.release?.commit === "string"
    && typeof healthPayload?.release?.buildId === "string";
  const instanceMatch = healthContractValid
    && (!expectedInstance || healthPayload.instance.id === expectedInstance)
    && (!expectedPort || healthPayload.instance.port === expectedPort);
  if (!healthContractValid) {
    checks.push(check("fail", "health-contract", "Control Center returned an invalid health-v2 contract"));
  } else if (!instanceMatch) {
    checks.push(check("fail", "health-identity", "Control Center health identity does not match the configured instance", {
      expectedInstance: expectedInstance || null,
      expectedPort: expectedPort || null,
      actualInstance: healthPayload.instance.id,
      actualPort: healthPayload.instance.port,
    }));
  } else {
    checks.push(check("pass", "health-contract", "Control Center health-v2 identity and release contract is valid", {
      instance: healthPayload.instance.id,
      port: healthPayload.instance.port,
      release: healthPayload.release,
    }));
  }

  const scripts = new Map();
  for (const page of pages) {
    const pageUrl = new URL(page, base).href;
    const response = await fetchText(pageUrl, timeoutMs, retries);
    const pageResult = {
      path: page,
      url: pageUrl,
      httpStatus: response.status,
      contentType: response.contentType,
      scripts: [],
      status: "pass",
      detail: "",
    };

    if (!response.ok) {
      pageResult.status = "fail";
      pageResult.detail = compact(response.error || response.text || response.contentType);
      checks.push(check("fail", `page:${page}`, "Control Center page failed to load", pageResult));
      pageResults.push(pageResult);
      continue;
    }

    const pageScripts = extractScriptUrls(response.text, pageUrl, base.origin);
    pageResult.scripts = pageScripts.map((scriptUrl) => new URL(scriptUrl).pathname);
    if (pageScripts.length === 0) {
      pageResult.status = "warn";
      pageResult.detail = "No same-origin JavaScript chunks found in rendered HTML";
      checks.push(check("warn", `page:${page}`, pageResult.detail, pageResult));
    } else {
      checks.push(check("pass", `page:${page}`, "Control Center page loaded and references JavaScript chunks", {
        ...pageResult,
        scriptCount: pageScripts.length,
      }));
    }

    for (const scriptUrl of pageScripts) scripts.set(scriptUrl, scriptUrl);
    pageResults.push(pageResult);
  }

  for (const scriptUrl of scripts.keys()) {
    const response = await fetchText(scriptUrl, timeoutMs, retries);
    const url = new URL(scriptUrl);
    const result = {
      path: `${url.pathname}${url.search}`,
      url: scriptUrl,
      httpStatus: response.status,
      contentType: response.contentType,
      status: "pass",
      detail: "",
    };
    const javascriptType = /\b(java|ecma)script\b|application\/x-javascript/i.test(response.contentType);
    if (!response.ok) {
      result.status = "fail";
      result.detail = compact(response.error || response.text || response.contentType);
      checks.push(check("fail", `chunk:${result.path}`, "Referenced JavaScript chunk failed to load", result));
    } else if (!javascriptType) {
      result.status = "fail";
      result.detail = `Unexpected content-type: ${response.contentType || "unknown"}`;
      checks.push(check("fail", `chunk:${result.path}`, "Referenced JavaScript chunk did not return JavaScript", result));
    } else if (/Internal Server Error/i.test(response.text)) {
      result.status = "fail";
      result.detail = "Chunk response contains Internal Server Error";
      checks.push(check("fail", `chunk:${result.path}`, result.detail, result));
    } else {
      checks.push(check("pass", `chunk:${result.path}`, "Referenced JavaScript chunk loaded", result));
    }
    chunkResults.push(result);
  }

  if (chunkResults.length === 0) {
    checks.push(check("warn", "chunks-present", "No JavaScript chunks were discovered across checked pages"));
  }

  return {
    schema: "pritha-control-center-health-v1",
    baseUrl,
    created_at: new Date().toISOString(),
    strict,
    status: summarizeStatus(checks, false),
    checks,
    pages: pageResults,
    chunks: chunkResults,
  };
}

function printHuman(payload) {
  console.log(`Pritha Control Center health: ${payload.status}`);
  console.log(`Base URL: ${payload.baseUrl}`);
  console.log(`Pages checked: ${payload.pages.length}`);
  console.log(`Chunks checked: ${payload.chunks.length}`);
  for (const item of payload.checks) {
    const marker = item.status.toUpperCase();
    const target = item.path || item.url || "";
    console.log(`- ${marker} ${item.id}${target ? ` ${target}` : ""}: ${item.message}`);
    if (item.detail) console.log(`  ${item.detail}`);
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(`Usage:
  node scripts/control-center-health.mjs
  node scripts/control-center-health.mjs --json
  node scripts/control-center-health.mjs --strict --port 3420
  node scripts/control-center-health.mjs --strict --retries 1
  node scripts/control-center-health.mjs --base-url http://127.0.0.1:3420

Read-only check. If Control Center is running, verifies that key UI pages and
their referenced Next.js JavaScript chunks load from the same live build. If the
server is not running, the default mode reports skipped and exits successfully;
use --strict when an active server is required.`);
  process.exit(0);
}

const payload = await runHealthcheck(options);
if (options.json) console.log(JSON.stringify(payload, null, 2));
else printHuman(payload);
if (payload.status === "fail") process.exitCode = 1;
