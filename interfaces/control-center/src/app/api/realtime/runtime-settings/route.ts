import { validChainedVoicePatch, normalizeChainedVoiceSettings } from "@/lib/voice/settings";
import { validateRuntimeNumbers } from "@/lib/settings/runtime-numbers";
import { NextResponse } from "next/server";
import {
  getPrithaRealtimeStatus,
  getPrithaRuntimeSettings,
  normalizeCodexExecutionMode,
  normalizeCodexPlanningMode,
  normalizeCodexReasoningEffort,
  normalizeCodexServiceTier,
  normalizeCodexVoiceProgressVerbosity,
  updatePrithaRuntimeSettings,
} from "@/lib/realtime/pritha-runtime";
import {
  isPrithaVoiceId,
  isVoiceBehaviorProfile,
  PRITHA_FEMININE_VOICE_OPTIONS,
  VOICE_BEHAVIOR_PROFILE_OPTIONS,
} from "@/lib/realtime/voice-settings";
import { getCodexModelCatalog } from "@/lib/settings/codex-model-catalog-server";
import {
  isSafeCodexReasoningEffort,
  normalizeCodexReasoningEffortToken,
  validateCodexSelection,
  type CodexServiceTier,
} from "@/lib/settings/codex-model-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeSettingsPayload = {
  deepTaskPrimaryTransport?: "codex-cli";
  codexModel?: string;
  codexReasoningEffort?: string;
  codexServiceTier?: string;
  codexWorkdir?: string;
  codexSandbox?: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess?: boolean;
  codexTimeoutMs?: number;
  codexPromptTokenBudget?: number;
  codexPlanningMode?: string;
  codexExecutionMode?: string;
  codexMaxPlanSteps?: number;
  codexAskBeforeOrchestration?: boolean;
  codexVoiceProgressVerbosity?: string;
  neuraldeepBillingAcknowledged?: boolean;
  voiceBehaviorProfile?: string;
  prithaVoice?: string;
  voiceTransport?: string;
  neuraldeepVoice?: unknown;
};

function transportStatus() {
  return getPrithaRealtimeStatus().codex.transports;
}

function isCodexPlanningMode(value: unknown) {
  return value === "off" || value === "inline_required" || value === "planner";
}

function isCodexExecutionMode(value: unknown) {
  return value === "inline_only" || value === "orchestrator_enabled" || value === "orchestrator_preferred";
}

function isCodexVoiceProgressVerbosity(value: unknown) {
  return value === "brief" || value === "normal" || value === "detailed";
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    settings: getPrithaRuntimeSettings(),
    transports: transportStatus(),
    behaviorProfiles: VOICE_BEHAVIOR_PROFILE_OPTIONS,
    voiceOptions: PRITHA_FEMININE_VOICE_OPTIONS,
  });
}

export async function POST(request: Request) {
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  const numericError = validateRuntimeNumbers(raw as Record<string, unknown>);
  if (numericError) return NextResponse.json({ ok: false, ...numericError }, { status: 400 });
  const payload = raw as RuntimeSettingsPayload;
  const patch: Parameters<typeof updatePrithaRuntimeSettings>[0] = {};
  const currentSettings = getPrithaRuntimeSettings();

  if ("deepTaskPrimaryTransport" in payload && payload.deepTaskPrimaryTransport !== "codex-cli") {
    return NextResponse.json({ ok: false, error: "neuraldeep_codex_cli_required" }, { status: 400 });
  }
  patch.deepTaskPrimaryTransport = "codex-cli";
  const updatesExecutionMode = "codexExecutionMode" in payload;
  let requestedExecutionMode = currentSettings.codexExecutionMode;
  if (updatesExecutionMode) {
    if (!isCodexExecutionMode(payload.codexExecutionMode)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_execution_mode" }, { status: 400 });
    }
    requestedExecutionMode = normalizeCodexExecutionMode(payload.codexExecutionMode);
    patch.codexExecutionMode = requestedExecutionMode;
  }
  const updatesCodexSelection = "codexModel" in payload || "codexReasoningEffort" in payload || "codexServiceTier" in payload;
  if (updatesCodexSelection) {
    if ("codexModel" in payload && typeof payload.codexModel !== "string") {
      return NextResponse.json({ ok: false, error: "invalid_codex_model" }, { status: 400 });
    }
    const model = typeof payload.codexModel === "string" ? payload.codexModel.trim() : currentSettings.codexModel;
    const rawEffort = "codexReasoningEffort" in payload ? payload.codexReasoningEffort : currentSettings.codexReasoningEffort;
    const effort = normalizeCodexReasoningEffortToken(rawEffort, "");
    if (!isSafeCodexReasoningEffort(effort)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_reasoning_effort" }, { status: 400 });
    }
    const rawServiceTier = "codexServiceTier" in payload ? payload.codexServiceTier : currentSettings.codexServiceTier;
    if (rawServiceTier !== "standard" && rawServiceTier !== "fast") {
      return NextResponse.json({ ok: false, error: "invalid_codex_service_tier" }, { status: 400 });
    }
    const serviceTier = normalizeCodexServiceTier(rawServiceTier) as CodexServiceTier;
    const catalog = await getCodexModelCatalog();
    const validation = validateCodexSelection(
      { model, effort, serviceTier },
      catalog.models,
      {
        model: currentSettings.codexModel,
        effort: currentSettings.codexReasoningEffort,
        serviceTier: currentSettings.codexServiceTier,
      },
    );
    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }
    const selectedCatalogModel = catalog.models.find((candidate) => candidate.id === model);
    if (
      model !== currentSettings.codexModel
      && selectedCatalogModel?.currentAccess !== "included"
      && payload.neuraldeepBillingAcknowledged !== true
    ) {
      return NextResponse.json({
        ok: false,
        error: "neuraldeep_billing_confirmation_required",
        model: {
          id: selectedCatalogModel?.id || model,
          billingClass: selectedCatalogModel?.billingClass || "unknown",
          currentAccess: selectedCatalogModel?.currentAccess || "unknown",
          walletPricing: selectedCatalogModel?.walletPricing || null,
        },
      }, { status: 409 });
    }
    if (effort === "ultra" && requestedExecutionMode !== "inline_only") {
      return NextResponse.json({ ok: false, error: "ultra_requires_inline_execution" }, { status: 400 });
    }
    patch.codexModel = model;
    patch.codexReasoningEffort = normalizeCodexReasoningEffort(rawEffort);
    patch.codexServiceTier = serviceTier;
    if (effort === "ultra") patch.codexExecutionMode = "inline_only";
  } else if (updatesExecutionMode && currentSettings.codexReasoningEffort === "ultra" && requestedExecutionMode !== "inline_only") {
    return NextResponse.json({ ok: false, error: "ultra_requires_inline_execution" }, { status: 400 });
  }
  if (typeof payload.codexWorkdir === "string") patch.codexWorkdir = payload.codexWorkdir;
  if (["auto", "read-only", "workspace-write", "danger-full-access"].includes(String(payload.codexSandbox))) {
    patch.codexSandbox = payload.codexSandbox;
  }
  if (typeof payload.codexNetworkAccess === "boolean") patch.codexNetworkAccess = payload.codexNetworkAccess;
  const effectiveSandbox = patch.codexSandbox || currentSettings.codexSandbox;
  const effectiveNetworkAccess = typeof patch.codexNetworkAccess === "boolean"
    ? patch.codexNetworkAccess
    : currentSettings.codexNetworkAccess;
  if (effectiveSandbox === "danger-full-access" && !effectiveNetworkAccess) {
    return NextResponse.json({ ok: false, error: "danger_full_access_requires_network_access" }, { status: 400 });
  }
  if (Object.hasOwn(payload, "codexTimeoutMs")) patch.codexTimeoutMs = payload.codexTimeoutMs;
  if (Object.hasOwn(payload, "codexPromptTokenBudget")) patch.codexPromptTokenBudget = payload.codexPromptTokenBudget;
  if ("codexPlanningMode" in payload) {
    if (!isCodexPlanningMode(payload.codexPlanningMode)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_planning_mode" }, { status: 400 });
    }
    patch.codexPlanningMode = normalizeCodexPlanningMode(payload.codexPlanningMode);
  }
  if (Object.hasOwn(payload, "codexMaxPlanSteps")) patch.codexMaxPlanSteps = payload.codexMaxPlanSteps;
  if (typeof payload.codexAskBeforeOrchestration === "boolean") patch.codexAskBeforeOrchestration = payload.codexAskBeforeOrchestration;
  if ("codexVoiceProgressVerbosity" in payload) {
    if (!isCodexVoiceProgressVerbosity(payload.codexVoiceProgressVerbosity)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_voice_progress_verbosity" }, { status: 400 });
    }
    patch.codexVoiceProgressVerbosity = normalizeCodexVoiceProgressVerbosity(payload.codexVoiceProgressVerbosity);
  }
  if ("codexAppThreadRoutingMode" in payload || "codexAppThreadMaxTurns" in payload || "codexAppThreadMaxAgeHours" in payload) {
    return NextResponse.json({ ok: false, error: "legacy_codex_app_setting_unsupported" }, { status: 400 });
  }
  if ("voiceBehaviorProfile" in payload) {
    if (!isVoiceBehaviorProfile(payload.voiceBehaviorProfile)) {
      return NextResponse.json({ ok: false, error: "invalid_voice_behavior_profile" }, { status: 400 });
    }
    patch.voiceBehaviorProfile = payload.voiceBehaviorProfile;
  }
  if ("prithaVoice" in payload) {
    if (!isPrithaVoiceId(payload.prithaVoice)) {
      return NextResponse.json({ ok: false, error: "invalid_pritha_voice" }, { status: 400 });
    }
    patch.prithaVoice = payload.prithaVoice;
  }

  if ("voiceTransport" in payload) {
    if (payload.voiceTransport !== "openai_realtime" && payload.voiceTransport !== "neuraldeep_chained") return NextResponse.json({ok:false,error:"invalid_voice_transport"},{status:400});
    patch.voiceTransport = payload.voiceTransport;
  }
  if ("neuraldeepVoice" in payload) {
    if (!validChainedVoicePatch(payload.neuraldeepVoice)) return NextResponse.json({ok:false,error:"invalid_neuraldeep_voice_settings"},{status:400});
    patch.neuraldeepVoice = normalizeChainedVoiceSettings({...currentSettings.neuraldeepVoice,...payload.neuraldeepVoice});
  }
  const settings = await updatePrithaRuntimeSettings(patch);
  return NextResponse.json({
    ok: true,
    settings,
    transports: transportStatus(),
    behaviorProfiles: VOICE_BEHAVIOR_PROFILE_OPTIONS,
    voiceOptions: PRITHA_FEMININE_VOICE_OPTIONS,
  });
}
