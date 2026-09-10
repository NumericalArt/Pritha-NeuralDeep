#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(projectRoot, "scripts", "neuraldeep-codex.mjs");
const expected = "PRITHA_NEURALDEEP_NETWORK_AUDIT_OK";

function proxyTarget(firstLine) {
  const match = String(firstLine || "").match(/^(?:CONNECT\s+([^\s]+)|[A-Z]+\s+https?:\/\/([^/\s]+))/i);
  return String(match?.[1] || match?.[2] || "unknown").slice(0, 300);
}

const observed = [];
const proxy = net.createServer((socket) => {
  let buffered = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffered = `${buffered}${chunk}`.slice(0, 8_192);
    const lineEnd = buffered.indexOf("\n");
    if (lineEnd < 0) return;
    observed.push(proxyTarget(buffered.slice(0, lineEnd).trim()));
    socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  });
});

await new Promise((resolve, reject) => {
  proxy.once("error", reject);
  proxy.listen(0, "127.0.0.1", resolve);
});
const address = proxy.address();
if (!address || typeof address === "string") throw new Error("network_audit_proxy_address_unavailable");
const proxyUrl = `http://127.0.0.1:${address.port}`;
const environment = {
  ...process.env,
  HTTP_PROXY: proxyUrl,
  HTTPS_PROXY: proxyUrl,
  ALL_PROXY: proxyUrl,
  http_proxy: proxyUrl,
  https_proxy: proxyUrl,
  all_proxy: proxyUrl,
  NO_PROXY: "127.0.0.1,localhost,::1,api.neuraldeep.ru,neuraldeep.ru",
  no_proxy: "127.0.0.1,localhost,::1,api.neuraldeep.ru,neuraldeep.ru",
};
for (const key of Object.keys(environment)) {
  if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
}

const child = spawn(process.execPath, [
  runner,
  "exec-json",
  "--model", process.env.PRITHA_NEURALDEEP_AUDIT_MODEL || "qwen3.6-35b-a3b",
  "--sandbox", "read-only",
  "--cwd", projectRoot,
  "--network", "disabled",
  "--ephemeral",
], {
  cwd: projectRoot,
  env: environment,
  stdio: ["pipe", "pipe", "pipe"],
});
child.stdin.end(`Respond exactly ${expected}. Do not use web, shell, files, plugins, apps, or any other tool.`);
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-4 * 1024 * 1024); });
child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_000); });
const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
});
await new Promise((resolve) => setTimeout(resolve, 250));
await new Promise((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));

let finalText = "";
for (const line of stdout.split("\n")) {
  try {
    const event = JSON.parse(line);
    if (event?.type === "item.completed" && event?.item?.type === "agent_message") finalText = String(event.item.text || "");
  } catch {
    // Only bounded JSONL is inspected; malformed lines are represented by the failed answer check.
  }
}
const forbiddenTargets = [...new Set(observed.filter(Boolean))].sort();
const ok = result.code === 0 && finalText.includes(expected) && forbiddenTargets.length === 0;
console.log(JSON.stringify({
  ok,
  provider: "neuraldeep",
  codexExitCode: result.code,
  signal: result.signal,
  expectedAnswerObserved: finalText.includes(expected),
  forbiddenProxyTargets: forbiddenTargets,
  stderrClass: result.code === 0 ? null : /429|rate.?limit/i.test(stderr) ? "rate_limited" : "runtime_failed",
}));
if (!ok) process.exitCode = 1;
