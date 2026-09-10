import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const settingsRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
const codexSettingsSource = readFileSync("interfaces/control-center/src/components/settings/CodexSettingsSection.tsx", "utf8");
const realtimeHookSource = readFileSync("interfaces/control-center/src/components/voice/usePrithaRealtime.ts", "utf8");

test("Codex task planning settings are persisted and exposed through runtime settings", () => {
  for (const key of [
    "codexPlanningMode",
    "codexExecutionMode",
    "codexMaxPlanSteps",
    "codexAskBeforeOrchestration",
    "codexVoiceProgressVerbosity",
  ]) {
    assert.match(runtimeSource, new RegExp(`${key}:`), `${key} should have a runtime default`);
    assert.match(settingsRouteSource, new RegExp(`${key}`), `${key} should be accepted by the settings API`);
    assert.match(codexSettingsSource, new RegExp(`${key}`), `${key} should be configurable from the Codex settings UI`);
  }

  assert.match(runtimeSource, /codexExecutionMode: "inline_only"/, "safe default should keep execution inline until the operator enables orchestration");
});

test("Codex plan steps setting is editable as a bounded maximum", () => {
  assert.match(codexSettingsSource, /parseRuntimeNumberDrafts\(numberDrafts, timeoutUnit\)/);
  assert.match(codexSettingsSource, /value=\{numberDrafts.codexMaxPlanSteps\}/);
  assert.doesNotMatch(codexSettingsSource, /clampPlanSteps|commitMaxPlanStepsDraft/);
  assert.doesNotMatch(
    codexSettingsSource,
    /updateRuntimeSetting\("codexMaxPlanSteps", Math\.max\(1, Math\.min\(10, Number\(event\.currentTarget\.value\) \|\| 7\)\)\)/,
    "the input must allow a temporary empty value while the operator edits it",
  );
});

test("Codex CLI tasks retain plan and voice feedback artifacts", () => {
  assert.match(runtimeSource, /function codexTaskPlanPath\(taskDir: string\)/);
  assert.match(runtimeSource, /function codexTaskVoiceFeedbackPath\(taskDir: string\)/);
  assert.match(runtimeSource, /plan_path: rootRelative\(root, planPath\)/);
  assert.match(runtimeSource, /voice_feedback_path: rootRelative\(root, voiceFeedbackPath\)/);
  assert.match(runtimeSource, /latest_voice_feedback/);
  assert.match(runtimeSource, /speakable_events/);
});

test("Realtime instructions prefer semantic voice feedback over heartbeat", () => {
  assert.match(runtimeSource, /Prefer latest_voice_feedback and speakable_events over heartbeat/);
  assert.match(runtimeSource, /Never read heartbeat as the main progress update/);
  assert.match(runtimeSource, /plan_created, planning_fallback, fallback_started, stale_repaired, mode_selected, step_started, step_completed, step_blocked or operator_question/);
});

test("Agent creation Codex tasks carry mandatory research gate metadata", () => {
  assert.match(runtimeSource, /agentCreationResearchGatePayload/);
  assert.match(runtimeSource, /agentDevelopmentResearchGatePayload/);
  assert.match(runtimeSource, /agent_creation_research_gate/);
  assert.match(runtimeSource, /agent_development_research_gate/);
  assert.match(runtimeSource, /node scripts\/pritha\.mjs research <contract>/);
  assert.match(runtimeSource, /node scripts\/pritha\.mjs pattern-research <contract>/);
  assert.match(runtimeSource, /node scripts\/pritha\.mjs improve <project-path> --task <text>/);
  assert.match(runtimeSource, /node scripts\/pritha\.mjs external-research <contract> --input <evidence\.json>/);
  assert.match(runtimeSource, /research_gate_status: complete/);
  assert.match(runtimeSource, /creates both the research report and a separate pattern-pack/);
  assert.match(runtimeSource, /complete current-source external research for volatile or pattern-derived choices/);
  assert.match(runtimeSource, /current instance private state/);
  assert.match(runtimeSource, /outcome-and-card completion/);
  assert.match(runtimeSource, /node scripts\/pritha\.mjs deliver <outcome-spec> --project <child-project>/);
  assert.match(runtimeSource, /node scripts\/pritha\.mjs card-readiness <agent-slug>/);
  assert.match(runtimeSource, /do not report the creation task complete if outcome delivery lacks verified evidence or a typed blocker/);
});

test("Step orchestrator remains policy gated", () => {
  assert.match(runtimeSource, /chooseCodexExecutionModeForPlan/);
  assert.match(runtimeSource, /settings\.codexExecutionMode === "inline_only"\) return "inline_progress"/);
  assert.match(runtimeSource, /settings\.codexExecutionMode === "orchestrator_enabled"/);
  assert.match(runtimeSource, /settings\.codexExecutionMode === "orchestrator_preferred"/);
});

test("operator questions leave actionable wait cards that resume only through CLI", () => {
  assert.match(runtimeSource, /statusValue !== "waiting_for_operator"/);
  assert.match(runtimeSource, /operator_question_terminal: false/);
  assert.match(runtimeSource, /export async function answerPrithaCodexTask/);
  assert.match(runtimeSource, /operator_question_answered: true/);
  assert.match(runtimeSource, /startCodexExec\(\s*nextRequest/);
  assert.match(runtimeSource, /const effectiveTransport = "codex-cli"/);
  assert.match(runtimeSource, /name: "answer_codex_task"/);
  assert.match(runtimeSource, /Do not start a new run_codex_task just to answer that clarification/);
});

test("Realtime Codex handoff waits for explicit full-brief confirmation", () => {
  assert.match(runtimeSource, /function codexTaskNeedsHandoffConfirmation\(args: CodexTaskArgs, task: Record<string, unknown>\)/);
  assert.match(runtimeSource, /function hasCodexHandoffConfirmation\(value: unknown\)/);
  assert.match(runtimeSource, /handoff_confirmation_required/);
  assert.match(runtimeSource, /ТЗ полностью проговорено\? Передавать это в Codex\?/);
  assert.match(runtimeSource, /brief is complete and ready for Codex/);
  assert.match(runtimeSource, /be proposal-first/);
  assert.match(runtimeSource, /ask only for missing product decisions/);
  assert.match(runtimeSource, /Infer routine runtime, deployment, memory, tools, skills, MCP and test defaults/);
  assert.match(runtimeSource, /Do not announce a fixed number of questions/);
  assert.match(runtimeSource, /Ask one concise question per turn/);
  assert.match(runtimeSource, /use up to five total only for genuinely complex or risky tasks/i);
  assert.match(runtimeSource, /short confirmations like да, ок, подтверждаю, передавай, запускай/);
  assert.match(runtimeSource, /concise synthesized note that the operator confirmed by voice/);
  assert.match(runtimeSource, /codexTaskContinuationChoiceProvided/);
  assert.match(runtimeSource, /do not repeat the task brief or ask for launch permission again/);
  assert.match(runtimeSource, /бриф\|тз\|task\|задани/);
  assert.match(runtimeSource, /подтвердил\|подтвердила\|confirmed/);

  const guardIndex = runtimeSource.indexOf("const handoffConfirmation = codexTaskHandoffConfirmationResult(args, task);");
  const mkdirIndex = runtimeSource.indexOf("await mkdir(taskDir, { recursive: true });");
  assert.ok(guardIndex > 0, "runCodexTask should check handoff confirmation");
  assert.ok(mkdirIndex > guardIndex, "handoff confirmation guard should run before task files/directories are created");
});

test("Codex task cards expose short ids and abort instead of card refresh", () => {
  const voicePageSource = readFileSync("interfaces/control-center/src/components/voice/VoiceControlPage.tsx", "utf8");
  const voiceStylesSource = readFileSync("interfaces/control-center/src/styles/globals.css", "utf8");

  assert.match(runtimeSource, /const CODEX_SHORT_ID_LENGTH = 3/);
  assert.match(runtimeSource, /short_id/);
  assert.match(runtimeSource, /export async function abortPrithaCodexTask/);
  assert.match(runtimeSource, /TERMINAL_CODEX_TASK_STATUSES = new Set\(\["complete", "failed", "failed_timeout", "failed_empty_result", "rejected", "aborted"\]\)/);
  assert.match(voicePageSource, /function taskShortLabel/);
  assert.match(voicePageSource, /className="task-short-id"/);
  assert.match(voicePageSource, /onAbortTask/);
  assert.match(voicePageSource, /\/api\/realtime\/codex-task\/\$\{encodeURIComponent\(taskId\)\}\/abort/);
  assert.match(voicePageSource, /disabled=\{taskIsTerminal\(task\)\}/);
  assert.match(voicePageSource, /<Square size=\{15\} \/>[\s\S]*Abort/);
  assert.doesNotMatch(voicePageSource, /onRefreshTask/);
  assert.match(voiceStylesSource, /\.task-short-id/);
});

test("Voice Codex confirmations can be synthesized from short spoken approval", () => {
  assert.match(runtimeSource, /function isShortPositiveConfirmation\(value: unknown\)/);
  assert.match(runtimeSource, /function extractRequestedConfirmationPhrase\(question: unknown\)/);
  assert.match(runtimeSource, /function synthesizeCodexOperatorAnswer\(question: unknown, spokenAnswer: string\)/);
  assert.match(runtimeSource, /synthesized_from_voice_confirmation/);
  assert.match(runtimeSource, /spoken_answer/);
  assert.match(runtimeSource, /requested_confirmation_phrase/);
  assert.match(runtimeSource, /isShortPositiveConfirmation\(spokenAnswer\)/);
});

test("Voice UI keeps watching approval-gated tasks and handoffs approval decisions once", () => {
  assert.match(realtimeHookSource, /reportedCodexTaskApprovalDecisionsRef/);
  assert.match(realtimeHookSource, /lastCodexTaskApprovalStatusRef/);
  assert.match(realtimeHookSource, /UI approval received for Voice task/);
  assert.match(realtimeHookSource, /UI rejection received for Voice task/);
  assert.doesNotMatch(realtimeHookSource, /do not ask for this approval again/);
  assert.match(realtimeHookSource, /codex_task_approval_handoff_sent/);
  assert.match(realtimeHookSource, /requestResponse\("codex_task_approval_received"\)/);
  assert.match(realtimeHookSource, /requestResponse\("codex_task_rejected"\)/);
  assert.match(realtimeHookSource, /if \(taskId\) startCodexTaskPolling\(taskId\);/);
  assert.match(realtimeHookSource, /item\.name === "run_codex_task" \|\| item\.name === "answer_codex_task"/);
  assert.match(realtimeHookSource, /latestFeedback\?\.speakable === false/);
});
