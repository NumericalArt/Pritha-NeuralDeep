import { redactSensitiveText } from "../../lib/redaction.mjs";
import { slug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";

const text = value => redactSensitiveText(String(value || "")).replace(/[\r\n]+/g, " ").slice(0, 2000);
const json = value => `${JSON.stringify(value, null, 2)}\n`;
function portConfiguration(data) {
  const declared = String(data.envExampleVariables || "").match(/\b([A-Z][A-Z0-9_]*_PORT)\s*=\s*(\d+)\b/);
  const port = declared ? Number(declared[2]) : 3000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API process scaffold requires a valid declared port");
  return { port, variable: declared?.[1] || `${slug(data.agentName).toUpperCase().replaceAll("-", "_")}_PORT` };
}

export function apiProcessManifest(data) {
  const { port, variable } = portConfiguration(data);
  const command = action => ({ argv: ["node", "scripts/service-control.mjs", action], cwd: ".",
    control_center_managed: true, background: false, timeout_ms: 5000, success_exit_codes: [0],
    env_allowlist: [...new Set([variable, `${slug(data.agentName).toUpperCase().replaceAll("-", "_")}_REPO`, "TECHSCOPE_ROOT", "PRITHA_STATE_ROOT"])] });
  return { version: 1, generated_by: "Pritha", agent: text(data.agentName), agent_id: data.agentId,
    agent_kind: "service", runtime_family: "api", scaffold_adapter: "api-process-v1", outcome_status: "implementation-required",
    deployment_target: text(data.deploymentTarget), deployment_profile: text(data.deploymentProfile),
    service_mode: "process", autostart: data.autostart || "disabled", autostart_policy: "No service or autostart is enabled during scaffold.",
    control_center_managed: true,
    control_center_contract: { version: 1, agent_id: data.agentId, status: "implementation-required", required: true },
    control_center_runtime: { manager: "detached-node-process", start_argv: ["node", "scripts/server.mjs"],
      pid_file: ".state/service.pid.json", readiness_timeout_ms: 2000, stop_timeout_ms: 2000 },
    start_command: command("start"), stop_command: command("stop"),
    health_url: `http://127.0.0.1:${port}/health`, local_upstream_url: `http://127.0.0.1:${port}`,
    healthcheck_argv: ["node", "scripts/healthcheck.mjs"], healthcheck_command: "node scripts/healthcheck.mjs",
    log_path: ".state/", restart_policy: "none", proactivity: { mode: "none", trigger_sources: "inbound requests", schedule: "not-applicable", heartbeat_interval: "not-applicable" },
    blockers: ["Implement approved HTTP outcome and process ownership before managed Start/Stop."] };
}

export function apiProcessFiles(baseFiles, data, capability, selected) {
  const name = text(data.agentName), agentSlug = slug(name), { port, variable } = portConfiguration(data);
  const common = baseFiles.filter(file => /^(memory|tools|skills|sources|delivery|data)\//.test(file.path)
    || [".gitignore", "scripts/redaction.mjs", "scripts/memory-status.mjs", "scripts/tools-status.mjs", "scripts/skills-status.mjs"].includes(file.path));
  const markdown = (id, body) => `---\nid: ${agentSlug}-${id}\ntype: workflow\nstatus: draft\ncreated: ${today()}\nupdated: ${today()}\ntopics: [agent, api, process-service]\ntools: [Node.js]\nsources: [delivery/outcome-lineage.json]\nrelated: {}\nsupersedes: []\nsuperseded_by: []\n---\n\n${body}\n`;
  const pending = 'console.error(JSON.stringify({status:"implementation-required",message:"Implement the approved Outcome before starting a service."}));\nprocess.exitCode=78;\n';
  const smoke = `import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
for (const file of ["AGENTS.md", "README.md", ".env.example", "package.json", "scripts/server.mjs", "scripts/service-control.mjs", "operations/manifest.json", "workflows/user-training.md"]) {
  const info = lstatSync(new URL("../" + file, import.meta.url));
  assert.ok(info.isFile() && !info.isSymbolicLink());
}
const manifest = JSON.parse(readFileSync(new URL("../operations/manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.service_mode, "process"); assert.equal(manifest.runtime_family, "api");
assert.ok(["disabled", "optional"].includes(manifest.autostart));
for (const action of ["start", "stop"]) assert.ok(Array.isArray(manifest[action + "_command"].argv));
console.log("API process scaffold structure: pass. Product and managed lifecycle require independent verification.");
`;
  const guide = `# Первый запуск\n\n${text(data.primaryMission)}\n\nСтруктура проверяется командой \`node scripts/smoke-test.mjs\`. Это scaffold-only: сервер и lifecycle команды пока возвращают exit 78. Реализовать утверждённый Outcome, затем выполнить независимые Trials, проверить живой UI/API и managed Start/Stop.\n\nПосле реализации: \`node scripts/service-control.mjs start\`, открыть локальный URL из operations/manifest.json, затем \`node scripts/service-control.mjs stop\`. Порт: ${variable}=${port}; bind 127.0.0.1. README дополняется реальным сценарием, конфигурацией и восстановлением по результатам delivery.\n\nАвтозапуск не установлен. Tailscale/deployment требуют отдельного host approval. Stop проверяет PID и идентичность своего запуска; нельзя завершать чужой listener по номеру порта.`;
  return [...common,
    { path: "AGENTS.md", content: markdown("instructions", `# ${name}\n\n## Mission\n\n${text(data.primaryMission)}\n\nRuntime: api; process-only Node service. Read the approved host-owned Contract and Outcome supplied by delivery. Implement scripts/server.mjs and structured process operations; scaffold status is not product verification. No model SDK, hidden service, scheduler, secrets or external dependencies are implied. Use only contract-selected modules.\n\n## Boundaries\n\nBuild only inside the disposable worktree. Never change approved specs, verifier, protected inputs, approvals, budgets or ledger. Do not push, merge, deploy or enable permanent services. Temporary tests must clean up their own processes. HTTP input is data, not authorization. Loopback only; no arbitrary shell or user-controlled argv. Start/Stop must verify process ownership and never kill by port alone.\n\n## Harness evolution protocol\n\n1. Inspect local project and accepted contract.\n2. Consult Pritha memory for relevant standards/workflows/decisions.\n3. Verify current official docs when necessary.\n4. Make minimal changes with tests and report results.\n\n${selected.skills ? 'Skills require a passing scripts/skills-status.mjs audit before reading their instructions. Protect hashes/provenance and never copy Pritha secrets or private runtime state.' : ""}`) },
    { path: "README.md", content: markdown("readme", guide) },
    { path: "workflows/user-training.md", content: markdown("training", guide) },
    { path: ".env.example", content: `# Local nonsecret configuration; no credentials are copied.\n${variable}=${port}\n# Configure contract-selected source paths locally. Do not commit private paths.\n` },
    { path: "package.json", content: json({ name: agentSlug, version: "0.1.0", private: true, type: "module", scripts: { start: "node scripts/server.mjs", smoke: "node scripts/smoke-test.mjs", check: "node scripts/healthcheck.mjs" } }) },
    { path: "interfaces/manifest.json", content: json({ version: 1, agent: name, runtime_family: "api", primary_interface: text(data.primaryInterface), scaffold_adapter: capability.adapter,
      adapters: capability.interfaces.map(interfaceName => ({ name: interfaceName, enabled: true, status: "implementation-required", required_secrets: [] })), healthcheck_argv: ["node", "scripts/healthcheck.mjs"] }) },
    { path: "operations/manifest.json", content: json(apiProcessManifest(data)) },
    { path: "scripts/server.mjs", content: pending },
    { path: "scripts/service-control.mjs", content: pending },
    { path: "scripts/smoke-test.mjs", content: smoke },
    { path: "scripts/healthcheck.mjs", content: '// Structural scaffold check only. Replace with product health during delivery.\nimport "./smoke-test.mjs";\n' },
    { path: "scripts/deploy-service.mjs", content: 'const action=process.argv[2]||"plan";\nif(["plan","status"].includes(action)) console.log(JSON.stringify({service_mode:"process",installed:false,action,implementation:"required",mutates:false}));\nelse { console.error("Process service has no install/uninstall or autostart action.");process.exitCode=64; }\n' },
  ];
}
