import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { contractData, validateContract } from "../agents-mother/contract.mjs";
import { outcomeSpecFile } from "../agents-mother/outcome-spec.mjs";
import { scaffoldCapability } from "../agents-mother/scaffold/capabilities.mjs";
import { apiProcessManifest } from "../agents-mother/scaffold/api-process.mjs";
import {neuralDeepExecutionProfile} from './model-execution-profile.mjs';

const SHA = text => createHash("sha256").update(text).digest("hex");
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const EARLY = new Set(["interview", "contract"]);
const POST_APPROVAL = new Set(["research", "scaffold", "implement", "verify", "finish"]);

/** A temporary exclusive loopback bind, immediately closed; no application starts. */
export function probeCreationPort(port, { timeoutMs = 1000 } = {}) {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) return Promise.resolve({ ok: false, code: "creation_port_invalid" });
  return new Promise(resolve => {
    const server = createServer(); server.unref(); let finished = false;
    const done = result => { if (!finished) { finished = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => { server.close(() => {}); done({ ok: false, code: "creation_port_probe_timeout" }); }, Math.min(3000, Math.max(50, timeoutMs)));
    server.on("error", error => done({ ok: false, code: error.code === "EADDRINUSE" ? "creation_port_in_use" : "creation_port_unverified" }));
    server.once("listening", () => server.close(error => done(error ? { ok: false, code: "creation_port_unverified" } : { ok: true, code: null })));
    try { server.listen({ port, host: "127.0.0.1", exclusive: true }); }
    catch { done({ ok: false, code: "creation_port_unverified" }); }
  });
}

/** Host preflight. Inputs are host-read job/reservation/runtime records, never model claims. */
export async function preflightAgentCreation(input, { portProbe = probeCreationPort } = {}) {
  const { job, root, stateRoot, agentParent, reservation, providerStatus } = input;
  const phase = input.phase || job?.phase || "interview", blockers = [], warnings = [];
  const add = (code, message) => { if (!blockers.some(blocker => blocker.code === code)) blockers.push({ code, message }); };
  const readiness = (code, message) => {
    if (EARLY.has(phase) && !job?.approvals?.contract) warnings.push({ code, message });
    else add(code, message);
  };
  let target = null, capability = null, port = null, data = null;
  const documents = { contract: "missing", outcome: "missing" };
  try {
    if (!SLUG.test(job?.agentId || "") || !path.isAbsolute(job?.target || "")) throw new Error();
    const parent = realpathSync(agentParent);
    if (!lstatSync(agentParent).isDirectory() || lstatSync(agentParent).isSymbolicLink()
      || realpathSync(path.dirname(job.target)) !== parent || path.basename(job.target) !== job.agentId) throw new Error();
    target = path.join(parent, job.agentId);
    if (existsSync(target) && (lstatSync(target).isSymbolicLink() || !lstatSync(target).isDirectory() || realpathSync(target) !== target)) throw new Error();
    if (!reservation || reservation.state !== "ready" || reservation.ownerId !== (input.expectedOwnerId || job.chatId)
      || path.resolve(reservation.path || "") !== target || !existsSync(target)) add("creation_target_ownership_unverified", "Целевой каталог ещё не подтверждён за этой задачей.");
  } catch { add("creation_target_boundary", "Целевой каталог должен быть отдельным агентом внутри каталога этого экземпляра."); }
  if (!new Set(["interview", "contract", "outcome", ...POST_APPROVAL]).has(phase)) add("creation_phase_invalid", "Этап создания требует восстановления по сохранённому состоянию.");

  const providerState = ["available", "rate_limited", "unavailable", "auth_required", "billing_required", "access_denied"].includes(providerStatus?.providerState) ? providerStatus.providerState : "unavailable";
  const model = providerStatus?.models?.find(item => item.id === providerStatus?.selected?.modelId);
  const provider = { localReady: providerStatus?.availability === "ready" && providerStatus?.effectiveProvider === "neuraldeep_cli", state: providerState,
    modelAllowed: Boolean(model && (!providerStatus?.selected?.effortId || model.effortIds?.includes(providerStatus.selected.effortId)
      || neuralDeepExecutionProfile(model.id).effortControl==='ignored')) };
  // A host document approval has no provider dispatch. Its configuration checks
  // still run; every model-launch caller retains the default provider check.
  if (input.checkProvider !== false) {
    if (!provider.localReady) add("creation_runtime_unavailable", "Локальный исполнитель NeuralDeep ещё не готов.");
    if (providerState !== "available") add(`creation_provider_${providerState}`, providerState === "auth_required" ? "Проверьте подключение NeuralDeep в настройках." : "NeuralDeep пока не готов принять запуск. Сохранённая задача остаётся на месте.");
    if (!provider.modelAllowed) add("creation_model_unavailable", "Выбранная модель или режим рассуждения недоступны в текущем каталоге.");
  }

  const readDocument = (kind) => {
    const document = job?.[kind];
    if (!document) return null;
    try {
      if (!/^creation_[a-f0-9]{24}$/.test(job.jobId || "") || path.resolve(job.draftRoot || "") !== path.join(path.resolve(stateRoot), "creation-drafts", job.jobId)) throw new Error();
      const allowedRoots = [job.draftRoot, path.join(stateRoot, "agents", "contracts")].filter(directory => existsSync(directory));
      if (!allowedRoots.length) throw new Error();
      const content = readBoundedRegularFile(document.path, { allowedRoots, maxBytes: 512 * 1024 }).text;
      if (SHA(content) !== document.hash) { add(`creation_${kind}_changed`, "Документ изменился после последней проверки. Обновите его состояние."); return null; }
      const frontmatter = parseFrontmatterData(content);
      if (frontmatter.type !== (kind === "contract" ? "agent-contract" : "agent-outcome-spec")) throw new Error();
      const approved = job.approvals?.[kind]?.hash === document.hash;
      if (!approved && ["accepted", "approved"].includes(frontmatter.status)) add(`creation_${kind}_host_approval_required`, "Статус документа не заменяет отдельное подтверждение хоста.");
      if (approved && (kind === "contract" ? frontmatter.status !== "accepted" : frontmatter.status !== "approved")) add(`creation_${kind}_approval_stale`, "Подтверждение больше не соответствует статусу документа.");
      const issues = kind === "contract" ? validateContract(document.path, { root, print: false }) : outcomeSpecFile(document.path, { root, stateRoot }).issues;
      documents[kind] = issues.length ? "invalid" : approved ? "approved" : "draft";
      if (issues.length && (kind === "contract" ? !EARLY.has(phase) : POST_APPROVAL.has(phase))) add(`creation_${kind}_invalid`, "Документ пока не проходит проверку; сначала завершите его подготовку.");
      return { content, valid: !issues.length, approved };
    } catch { documents[kind] = "unverified"; add(`creation_${kind}_boundary`, "Документ недоступен в разрешённом каталоге этой задачи."); return null; }
  };
  const contract = readDocument("contract"), outcome = readDocument("outcome");
  if (!EARLY.has(phase) && !contract) add("creation_contract_missing", "Сначала подготовьте контракт агента.");
  if (!EARLY.has(phase) && !contract?.approved) add("creation_contract_approval_required", "Контракт требует отдельного подтверждения перед следующим этапом.");
  if (POST_APPROVAL.has(phase) && !outcome) add("creation_outcome_missing", "Сначала подготовьте спецификацию результата.");
  if (POST_APPROVAL.has(phase) && !outcome?.approved) add("creation_outcome_approval_required", "Спецификация результата требует отдельного подтверждения.");
  if (contract?.valid) {
    try {
      data = contractData(job.contract.path, { root });
      if ((data.technicalSlug || data.agentId) !== job.agentId || path.resolve(root, data.targetFolder || "") !== target) add("creation_contract_target_mismatch", "Контракт должен описывать именно зарезервированного агента.");
      capability = scaffoldCapability(data);
      if (!capability.supported) readiness("creation_adapter_unavailable", "Исправьте черновик: для выбранного устройства агента пока нет готового адаптера scaffold.");
      if (capability.adapter === "api-process-v1") {
        port = Number(new URL(apiProcessManifest(data).health_url).port);
        const probe = await portProbe(port);
        if (!probe.ok) readiness(["creation_port_in_use", "creation_port_invalid", "creation_port_probe_timeout"].includes(probe.code) ? probe.code : "creation_port_unverified",
          "Локальный порт агента занят или не удалось подтвердить его доступность. В черновике выберите свободный порт.");
      }
    } catch { add("creation_contract_runtime_unverified", "Не удалось проверить runtime и порт из контракта."); }
  }
  return { ok: blockers.length === 0, blockers, warnings, phase, target, documents, provider,
    adapter: capability ? { supported: capability.supported, name: capability.adapter, reason: capability.reason } : null,
    port: port === null ? null : { value: port, checked: true }, scope: "pre-dispatch-only; port availability is not a reservation" };
}
