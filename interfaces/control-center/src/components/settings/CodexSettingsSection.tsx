"use client";

import { useEffect, useMemo, useState } from "react";
import { runtimeNumberDrafts, parseRuntimeNumberDrafts, convertTimeoutDraft, hasRuntimeNumbers, type RuntimeNumberKey, type TimeoutUnit } from "@/lib/settings/runtime-numbers";
import { CircleAlert, Code2, Save, Terminal, Zap } from "lucide-react";
import {
  FALLBACK_CODEX_MODELS,
  codexModelSupportsFast,
  codexReasoningEffortLabel,
  fallbackCodexModelCatalog,
  reconcileCodexSelectionForModel,
  type CodexModelCatalog,
  type CodexReasoningEffort,
  type CodexServiceTier,
} from "@/lib/settings/codex-model-catalog";

type CodexPlanningMode = "off" | "inline_required" | "planner";
type CodexExecutionMode = "inline_only" | "orchestrator_enabled" | "orchestrator_preferred";
type CodexVoiceProgressVerbosity = "brief" | "normal" | "detailed";
type RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-cli";
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  codexServiceTier: CodexServiceTier;
  codexWorkdir: string;
  codexSandbox: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApproval: "never";
  codexTimeoutMs: number;
  codexPromptTokenBudget: number;
  codexPlanningMode: CodexPlanningMode;
  codexExecutionMode: CodexExecutionMode;
  codexMaxPlanSteps: number;
  codexAskBeforeOrchestration: boolean;
  codexVoiceProgressVerbosity: CodexVoiceProgressVerbosity;
  updatedAt: string;
};

type TransportStatus = Record<string, { available?: boolean; detail?: string }>;

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-cli",
  codexModel: "qwen3.6-35b-a3b",
  codexReasoningEffort: "medium",
  codexServiceTier: "standard",
  codexWorkdir: "",
  codexSandbox: "auto",
  codexNetworkAccess: true,
  codexApproval: "never",
  codexTimeoutMs: 300_000,
  codexPromptTokenBudget: 24_000,
  codexPlanningMode: "planner",
  codexExecutionMode: "inline_only",
  codexMaxPlanSteps: 7,
  codexAskBeforeOrchestration: true,
  codexVoiceProgressVerbosity: "normal",
  updatedAt: "",
};

const SAVED_RUNTIME_KEYS = [
  "deepTaskPrimaryTransport",
  "codexModel",
  "codexReasoningEffort",
  "codexServiceTier",
  "codexWorkdir",
  "codexSandbox",
  "codexNetworkAccess",
  "codexApproval",
  "codexTimeoutMs",
  "codexPromptTokenBudget",
  "codexPlanningMode",
  "codexExecutionMode",
  "codexMaxPlanSteps",
  "codexAskBeforeOrchestration",
  "codexVoiceProgressVerbosity",
] as const satisfies readonly (keyof RuntimeSettings)[];

function runtimeSettingsFingerprint(settings: RuntimeSettings) {
  return JSON.stringify(SAVED_RUNTIME_KEYS.map((key) => settings[key]));
}

export function CodexSettingsSection() {
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [savedRuntimeSettings, setSavedRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [modelCatalog, setModelCatalog] = useState<CodexModelCatalog>(() => fallbackCodexModelCatalog(new Date(0)));
  const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>({});
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [timeoutUnit, setTimeoutUnit] = useState<TimeoutUnit>("seconds");
  const [numberDrafts, setNumberDrafts] = useState(() => runtimeNumberDrafts(DEFAULT_RUNTIME_SETTINGS, "seconds"));
  const [selectionNotice, setSelectionNotice] = useState("");
  const [savedModelId, setSavedModelId] = useState(DEFAULT_RUNTIME_SETTINGS.codexModel);
  const [showBillingConfirmation, setShowBillingConfirmation] = useState(false);
  const runtimeSettingsDirty = useMemo(
    () => runtimeSettingsLoaded && (runtimeSettingsFingerprint(runtimeSettings) !== runtimeSettingsFingerprint(savedRuntimeSettings) || JSON.stringify(numberDrafts) !== JSON.stringify(runtimeNumberDrafts(savedRuntimeSettings, timeoutUnit))),
    [runtimeSettings, runtimeSettingsLoaded, savedRuntimeSettings, numberDrafts, timeoutUnit],
  );
  const runtimeActionStatus = saving
    ? "Applying Codex settings…"
    : runtimeStatus.startsWith("Failed")
      ? runtimeStatus
      : runtimeSettingsDirty
        ? "Unsaved changes — apply them before starting a new task."
        : runtimeStatus || "Saved settings are active for new tasks.";

  useEffect(() => {
    const controller = new AbortController();
    void loadRuntimeSettings(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadRuntimeSettings(signal: AbortSignal) {
    setRuntimeSettingsLoaded(false);
    const [runtimeResponse, catalogResponse] = await Promise.all([
      fetch("/api/realtime/runtime-settings", { cache: "no-store", signal }).catch(() => null),
      fetch("/api/settings/codex-models", { cache: "no-store", signal }).catch(() => null),
    ]);
    const catalogPayload = catalogResponse?.ok ? ((await catalogResponse.json().catch(() => null)) as CodexModelCatalog | null) : null;
    if (signal.aborted) return;
    const loadedCatalog = catalogPayload && Array.isArray(catalogPayload.models) && catalogPayload.models.length
      ? catalogPayload
      : { ...fallbackCodexModelCatalog(), warning: "Catalog endpoint unavailable; built-in fallback is active." };
    setModelCatalog(loadedCatalog);
    if (!runtimeResponse?.ok) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const payload = (await runtimeResponse.json().catch(() => null)) as {
      ok?: boolean;
      settings?: RuntimeSettings;
      transports?: TransportStatus;
    } | null;
    if (signal.aborted) return;
    if (payload?.ok !== true || !hasRuntimeNumbers(payload.settings)) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const loadedSettings = { ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings };
    if (loadedSettings.updatedAt === new Date(0).toISOString()) {
      const preferred = loadedCatalog.models.find((model) => model.isDefault);
      if (preferred && !loadedCatalog.models.find((model) => model.id === loadedSettings.codexModel)?.capabilitiesKnown) {
        const reconciled = reconcileCodexSelectionForModel(preferred, {
          model: loadedSettings.codexModel,
          effort: loadedSettings.codexReasoningEffort,
          serviceTier: loadedSettings.codexServiceTier,
        });
        loadedSettings.codexModel = reconciled.model;
        loadedSettings.codexReasoningEffort = reconciled.effort;
        loadedSettings.codexServiceTier = reconciled.serviceTier;
      }
    }
    const forcedInline = loadedSettings.codexReasoningEffort === "ultra" && loadedSettings.codexExecutionMode !== "inline_only";
    const nextSettings = forcedInline ? { ...loadedSettings, codexExecutionMode: "inline_only" as const } : loadedSettings;
    setRuntimeSettings(nextSettings);
    setSavedRuntimeSettings(nextSettings);
    setSavedModelId(nextSettings.codexModel);
    setShowBillingConfirmation(false);
    setNumberDrafts(runtimeNumberDrafts(nextSettings, timeoutUnit));
    setTransportStatus(payload.transports || {});
    setRuntimeSettingsLoaded(true);
    setRuntimeStatus("");
    setSelectionNotice(forcedInline ? "Ultra includes automatic task delegation; Execution Mode was set to Inline only to avoid nested orchestration." : "");
  }

  async function saveRuntimeSettings(billingConfirmed = false) {
    const parsed = parseRuntimeNumberDrafts(numberDrafts, timeoutUnit);
    if (!parsed.values) { setRuntimeStatus(`Failed to save: ${parsed.error}`); return; }
    const modelToSave = modelCatalog.models.find((model) => model.id === runtimeSettings.codexModel);
    const needsBillingConfirmation = runtimeSettings.codexModel !== savedModelId
      && modelToSave?.currentAccess !== "included";
    if (needsBillingConfirmation && !billingConfirmed) {
      setShowBillingConfirmation(true);
      setRuntimeStatus("");
      return;
    }
    setSaving(true);
    setShowBillingConfirmation(false);
    setRuntimeStatus("");
    const settingsToSave = {
      ...runtimeSettings,
      ...parsed.values,
    };
    const response = await fetch("/api/realtime/runtime-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deepTaskPrimaryTransport: settingsToSave.deepTaskPrimaryTransport,
        codexModel: settingsToSave.codexModel,
        codexReasoningEffort: settingsToSave.codexReasoningEffort,
        codexServiceTier: settingsToSave.codexServiceTier,
        codexWorkdir: settingsToSave.codexWorkdir,
        codexSandbox: settingsToSave.codexSandbox,
        codexNetworkAccess: settingsToSave.codexNetworkAccess,
        codexTimeoutMs: settingsToSave.codexTimeoutMs,
        codexPromptTokenBudget: settingsToSave.codexPromptTokenBudget,
        codexPlanningMode: settingsToSave.codexPlanningMode,
        codexExecutionMode: settingsToSave.codexExecutionMode,
        codexMaxPlanSteps: settingsToSave.codexMaxPlanSteps,
        codexAskBeforeOrchestration: settingsToSave.codexAskBeforeOrchestration,
        codexVoiceProgressVerbosity: settingsToSave.codexVoiceProgressVerbosity,
        neuraldeepBillingAcknowledged: billingConfirmed,
      }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { settings?: RuntimeSettings; transports?: TransportStatus; error?: string; message?: string; ok?: boolean } | null;
    setSaving(false);
    if (!response?.ok || payload?.ok !== true || !hasRuntimeNumbers(payload.settings)) {
      setRuntimeStatus(payload?.error ? `Failed to save: ${payload.message || payload.error}` : "Failed to save Codex runtime settings");
      return;
    }
    const nextSettings = { ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings };
    setRuntimeSettings(nextSettings);
    setSavedRuntimeSettings(nextSettings);
    setSavedModelId(nextSettings.codexModel);
    setNumberDrafts(runtimeNumberDrafts(nextSettings, timeoutUnit));
    setTransportStatus(payload.transports || {});
    setRuntimeStatus("Codex runtime settings saved");
    setSelectionNotice("");
  }

  function updateRuntimeSetting<K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  }

  function selectSandbox(codexSandbox: RuntimeSettings["codexSandbox"]) {
    setRuntimeSettings((current) => ({
      ...current,
      codexSandbox,
      codexNetworkAccess: codexSandbox === "danger-full-access" ? true : current.codexNetworkAccess,
    }));
  }

  function selectModel(model: string) {
    setShowBillingConfirmation(false);
    const catalogModel = modelCatalog.models.find((item) => item.id === model);
    if (!catalogModel) {
      setRuntimeSettings((current) => ({ ...current, codexModel: model }));
      return;
    }
    const next = reconcileCodexSelectionForModel(catalogModel, {
      model: runtimeSettings.codexModel,
      effort: runtimeSettings.codexReasoningEffort,
      serviceTier: runtimeSettings.codexServiceTier,
    });
    const notices: string[] = [];
    if (next.effortChanged) {
      notices.push(`${codexReasoningEffortLabel(runtimeSettings.codexReasoningEffort)} is unavailable for ${catalogModel.label}; using ${codexReasoningEffortLabel(next.effort)}.`);
    }
    if (next.serviceTierChanged) notices.push(`Fast is unavailable for ${catalogModel.label}; using Standard.`);
    setSelectionNotice(notices.join(" "));
    setRuntimeSettings({
      ...runtimeSettings,
      codexModel: next.model,
      codexReasoningEffort: next.effort,
      codexServiceTier: next.serviceTier,
    });
  }

  function selectReasoningEffort(effort: CodexReasoningEffort) {
    const forceInline = effort === "ultra" && runtimeSettings.codexExecutionMode !== "inline_only";
    setSelectionNotice(forceInline ? "Ultra includes automatic task delegation; Execution Mode was set to Inline only to avoid nested orchestration." : "");
    setRuntimeSettings({
      ...runtimeSettings,
      codexReasoningEffort: effort,
      codexExecutionMode: forceInline ? "inline_only" : runtimeSettings.codexExecutionMode,
    });
  }

  function updateNumberDraft(key: RuntimeNumberKey, value: string) {
    setNumberDrafts(current => ({ ...current, [key]: value })); setRuntimeStatus("");
  }
  function changeTimeoutUnit(next: TimeoutUnit) {
    const converted = convertTimeoutDraft(numberDrafts.codexTimeoutMs, timeoutUnit, next);
    if (converted == null) { setRuntimeStatus("Failed to switch unit: finish editing the timeout number first."); return; }
    updateNumberDraft("codexTimeoutMs", converted); setTimeoutUnit(next);
  }

  const cliAvailable = transportStatus.codex_cli?.available;
  const selectedModel = modelCatalog.models.find((model) => model.id === runtimeSettings.codexModel);
  const modelOptions = selectedModel
    ? modelCatalog.models
    : [
        {
          ...FALLBACK_CODEX_MODELS[0],
          id: runtimeSettings.codexModel,
          label: `${runtimeSettings.codexModel || "Codex default"} — Unavailable/custom`,
          isDefault: false,
          defaultReasoningEffort: runtimeSettings.codexReasoningEffort,
          supportedReasoningEfforts: [],
          serviceTiers: [],
        },
        ...modelCatalog.models,
      ];
  const advertisedEfforts = selectedModel?.supportedReasoningEfforts || [];
  const selectedEffort = advertisedEfforts.find((effort) => effort.id === runtimeSettings.codexReasoningEffort);
  const reasoningOptions = selectedEffort
    ? advertisedEfforts
    : [
        {
          id: runtimeSettings.codexReasoningEffort,
          label: `${codexReasoningEffortLabel(runtimeSettings.codexReasoningEffort)} — Unavailable/custom`,
          description: "This saved effort is not advertised by the current local Codex catalog.",
        },
        ...advertisedEfforts,
      ];
  const fastSupported = Boolean(selectedModel && codexModelSupportsFast(selectedModel));
  const fastStatus = fastSupported
    ? "Fast is about 1.5x quicker and increases Codex usage."
    : !selectedModel && runtimeSettings.codexServiceTier === "fast"
      ? "The saved Fast setting is preserved, but this custom model is unavailable in the current catalog."
      : "Fast is unavailable for this model.";
  const effortStatus = runtimeSettings.codexReasoningEffort === "ultra"
    ? "Ultra includes automatic task delegation; keep Execution Mode inline to avoid nested orchestration."
    : selectedEffort?.description || "This saved effort is unavailable in the current local catalog.";
  const catalogTime = modelCatalog.refreshedAt && modelCatalog.refreshedAt !== new Date(0).toISOString()
    ? new Date(modelCatalog.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "pending";
  const accessLabel = selectedModel?.currentAccess === "included"
    ? "Included in the current subscription"
    : selectedModel?.currentAccess === "payg"
      ? "Wallet pay-as-you-go"
      : selectedModel?.currentAccess === "requires_wallet"
        ? "May require switching to wallet mode"
        : selectedModel?.currentAccess === "requires_plan"
          ? "May require another plan or wallet mode"
          : "Access will be confirmed by NeuralDeep at request time";
  const rateLabel = selectedModel?.walletPricing
    ? `Wallet reference: input ${selectedModel.walletPricing.inputRubPerMillion ?? "?"} ₽/1M, cached ${selectedModel.walletPricing.cachedInputRubPerMillion ?? "?"} ₽/1M, output ${selectedModel.walletPricing.outputRubPerMillion ?? "?"} ₽/1M.`
    : "No public wallet token rate is available for this model.";

  function modelOptionLabel(option: (typeof modelOptions)[number]) {
    const access = option.currentAccess === "included"
      ? "included"
      : option.currentAccess === "payg"
        ? "wallet"
        : option.currentAccess === "requires_wallet"
          ? "wallet required"
          : option.currentAccess === "requires_plan"
            ? "plan/wallet required"
            : "access unknown";
    return `${option.label}${option.isDefault ? " (default)" : ""} — ${access}`;
  }

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <Code2 size={22} />
          </span>
          <div>
            <h2>Codex</h2>
            <p>Deep task runtime</p>
          </div>
        </div>
      </div>
      {!runtimeSettingsLoaded ? (
        <div className="settings-rowline">
          <div>
            <strong>Codex Runtime</strong>
            <span>{runtimeStatus || "Loading saved Codex runtime settings..."}</span>
          </div>
        </div>
      ) : (
        <fieldset className="settings-fields" disabled={saving}>
          <div className="settings-rowline codex-transport-row">
            <div>
              <strong>Deep Task Transport</strong>
              <span>All non-voice work uses the isolated Codex CLI through NeuralDeep. There is no inference fallback.</span>
            </div>
            <span className="settings-status-chip alive">NeuralDeep · Codex CLI</span>
          </div>
          <div className="codex-transport-status" aria-label="Codex transport status">
            <span className={cliAvailable ? "good" : ""}>
              <Terminal size={16} />
              Isolated Codex CLI {cliAvailable ? "ready" : "unavailable"}
            </span>
            <span>Provider: NeuralDeep</span>
            <span>OpenAI excluded from this process</span>
          </div>
          <div className="codex-catalog-meta" aria-label="Codex model catalog status">
            <span className={modelCatalog.source === "neuraldeep" ? "good" : "warn"}>
              Model catalog: {modelCatalog.source === "neuraldeep" ? "live NeuralDeep" : modelCatalog.source === "cache" ? "NeuralDeep cache" : "safe fallback"}
            </span>
            <span>Refreshed {catalogTime}</span>
            {modelCatalog.warning ? <span className="warn">{modelCatalog.warning}</span> : null}
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Model</strong>
              <span>Every NeuralDeep chat model and every token-priced model remains selectable. Changes apply only to new chats; existing chats stay pinned to their model.</span>
            </div>
            <select value={runtimeSettings.codexModel} aria-label="Codex model" onChange={(event) => selectModel(event.currentTarget.value)}>
              {modelOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {modelOptionLabel(option)}
                </option>
              ))}
            </select>
          </div>
          {selectedModel ? (
            <div className="codex-model-billing-summary" aria-live="polite">
              <div><strong>{accessLabel}</strong><span>{rateLabel}</span></div>
              <div className="settings-mini-metrics">
                <span>{selectedModel.catalogPresence === "pricing" ? "Public price catalog" : "Current key catalog"}</span>
                <span>{selectedModel.capabilitiesKnown ? "Capabilities confirmed" : "Capabilities unknown"}</span>
                <span>{selectedModel.capabilities.tools ? "Tools confirmed" : "Tools not confirmed"}</span>
                <span>{selectedModel.capabilities.reasoning ? "Reasoning controls" : "No reasoning control"}</span>
                <span>{selectedModel.capabilities.vision ? "Vision input" : "Text input"}</span>
                <span>{selectedModel.contextWindow ? `${selectedModel.contextWindow.toLocaleString()} context` : "Context unknown"}</span>
                {selectedModel.region ? <span>Region {selectedModel.region}</span> : null}
              </div>
            </div>
          ) : null}
          <div className="settings-rowline">
            <div>
              <strong>Reasoning Level</strong>
              <span>{effortStatus}</span>
            </div>
            <select
              value={runtimeSettings.codexReasoningEffort}
              aria-label="Codex reasoning level"
              onChange={(event) => selectReasoningEffort(event.currentTarget.value)}
            >
              {reasoningOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Speed</strong>
              <span>{fastStatus}</span>
            </div>
            <div className={`settings-segmented-control compact${fastSupported ? "" : " single"}`} role="radiogroup" aria-label="Codex speed">
              <button
                className={runtimeSettings.codexServiceTier === "standard" ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={runtimeSettings.codexServiceTier === "standard"}
                disabled={!selectedModel}
                onClick={() => updateRuntimeSetting("codexServiceTier", "standard")}
              >
                Standard
              </button>
              {fastSupported ? (
                <button
                  className={runtimeSettings.codexServiceTier === "fast" ? "active" : ""}
                  type="button"
                  role="radio"
                  aria-checked={runtimeSettings.codexServiceTier === "fast"}
                  onClick={() => updateRuntimeSetting("codexServiceTier", "fast")}
                >
                  <Zap size={14} />
                  Fast
                </button>
              ) : null}
            </div>
          </div>
          {selectionNotice ? <div className="codex-selection-notice" role="status">{selectionNotice}</div> : null}
          {showBillingConfirmation && selectedModel ? (
            <div className="codex-billing-confirmation" role="alert">
              <CircleAlert size={19} />
              <div>
                <strong>Confirm model access and possible charges</strong>
                <span>{accessLabel}. {rateLabel} NeuralDeep will make the final access and billing decision; Pritha will not substitute another model.</span>
              </div>
              <button className="outline-button" type="button" onClick={() => void saveRuntimeSettings(true)} disabled={saving}>Continue and save</button>
            </div>
          ) : null}
          <div className="settings-rowline">
            <div>
              <strong>Codex Sandbox</strong>
              <span>Auto follows task type and write mode. Danger full access also implies unrestricted network access.</span>
            </div>
            <select
              value={runtimeSettings.codexSandbox}
              aria-label="Codex sandbox policy"
              onChange={(event) => selectSandbox(event.currentTarget.value as RuntimeSettings["codexSandbox"])}
            >
              <option value="auto">Auto</option>
              <option value="read-only">Read-only</option>
              <option value="workspace-write">Workspace-write</option>
              <option value="danger-full-access">Danger full access</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Network Access</strong>
              <span>Allow current-source checks only for deep tasks marked as requiring internet. Read-only Codex Chat keeps network off.</span>
            </div>
            <label className="settings-switch" aria-label="Codex network access">
              <input
                type="checkbox"
                checked={runtimeSettings.codexNetworkAccess}
                disabled={runtimeSettings.codexSandbox === "danger-full-access"}
                onChange={(event) => updateRuntimeSetting("codexNetworkAccess", event.currentTarget.checked)}
              />
              <span />
            </label>
          </div>
          <div className={`settings-action-row codex-runtime-inline-save ${runtimeSettingsDirty ? "dirty" : ""}`}>
            <button className="outline-button" type="button" onClick={() => void saveRuntimeSettings(false)} disabled={saving}>
              <Save size={16} />
              {saving ? "Applying" : "Apply Codex settings"}
            </button>
            <span role="status">{runtimeActionStatus}</span>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Task Timeout</strong>
              <span>Maximum runtime for NeuralDeep Codex CLI deep task execution.</span>
            </div>
            <input
              className="settings-number-input"
              type="number"
              min={timeoutUnit === "seconds" ? 10 : 10000}
              max={timeoutUnit === "seconds" ? 3600 : 3600000}
              step={timeoutUnit === "seconds" ? 0.001 : 1}
              value={numberDrafts.codexTimeoutMs}
              aria-label={`Codex task timeout ${timeoutUnit}`}
              onChange={(event) => updateNumberDraft("codexTimeoutMs", event.currentTarget.value)}
            />
            <select value={timeoutUnit} aria-label="Task timeout unit" onChange={event => changeTimeoutUnit(event.currentTarget.value as TimeoutUnit)}>
              <option value="seconds">Seconds</option><option value="milliseconds">Milliseconds</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Prompt Budget</strong>
              <span>Estimated outbound prompt tokens before compacting older context.</span>
            </div>
            <input
              className="settings-number-input"
              type="number"
              min={4000}
              max={120000}
              step={1000}
              value={numberDrafts.codexPromptTokenBudget}
              aria-label="Codex prompt token budget"
              onChange={(event) => updateNumberDraft("codexPromptTokenBudget", event.currentTarget.value)}
            />
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Planning Mode</strong>
              <span>Controls whether new NeuralDeep Codex CLI tasks create a plan before execution.</span>
            </div>
            <select
              value={runtimeSettings.codexPlanningMode}
              aria-label="Codex planning mode"
              onChange={(event) => updateRuntimeSetting("codexPlanningMode", event.currentTarget.value as RuntimeSettings["codexPlanningMode"])}
            >
              <option value="planner">Planner pass</option>
              <option value="inline_required">Inline required</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Execution Mode</strong>
              <span>
                {runtimeSettings.codexReasoningEffort === "ultra"
                  ? "Ultra delegates automatically, so outer orchestration stays Inline only."
                  : "Inline keeps one Codex turn. Orchestrator can run the plan step by step for testing."}
              </span>
            </div>
            <select
              value={runtimeSettings.codexExecutionMode}
              aria-label="Codex execution mode"
              disabled={runtimeSettings.codexReasoningEffort === "ultra"}
              onChange={(event) => updateRuntimeSetting("codexExecutionMode", event.currentTarget.value as RuntimeSettings["codexExecutionMode"])}
            >
              <option value="inline_only">Inline only</option>
              <option value="orchestrator_enabled">Orchestrator when recommended</option>
              <option value="orchestrator_preferred">Orchestrator preferred</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Plan Steps</strong>
              <span>Maximum number of planner steps stored and executed.</span>
            </div>
            <input
              className="settings-number-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              step={1}
              value={numberDrafts.codexMaxPlanSteps}
              aria-label="Codex maximum plan steps"
              onChange={(event) => updateNumberDraft("codexMaxPlanSteps", event.currentTarget.value)}
            />
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Ask Before Orchestration</strong>
              <span>Pause when the planner says operator input is required.</span>
            </div>
            <label className="settings-switch" aria-label="Codex ask before orchestration">
              <input
                type="checkbox"
                checked={runtimeSettings.codexAskBeforeOrchestration}
                onChange={(event) => updateRuntimeSetting("codexAskBeforeOrchestration", event.currentTarget.checked)}
              />
              <span />
            </label>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Voice Progress</strong>
              <span>Controls how much semantic Codex progress Voice Control should prefer.</span>
            </div>
            <select
              value={runtimeSettings.codexVoiceProgressVerbosity}
              aria-label="Codex voice progress verbosity"
              onChange={(event) => updateRuntimeSetting("codexVoiceProgressVerbosity", event.currentTarget.value as RuntimeSettings["codexVoiceProgressVerbosity"])}
            >
              <option value="brief">Brief</option>
              <option value="normal">Normal</option>
              <option value="detailed">Detailed</option>
            </select>
          </div>
          <div className="settings-action-row">
            <button className="outline-button" type="button" onClick={() => void saveRuntimeSettings(false)} disabled={saving}>
              <Save size={16} />
              {saving ? "Saving" : "Save Codex Runtime"}
            </button>
            <span role="status">{runtimeActionStatus} Approval: {runtimeSettings.codexApproval}.</span>
          </div>
        </fieldset>
      )}
    </section>
  );
}
