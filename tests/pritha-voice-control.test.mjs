import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const toolRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/tool/route.ts", "utf8");
const intakeRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/intake/route.ts", "utf8");
const voicePageSource = readFileSync("interfaces/control-center/src/components/voice/VoiceControlPage.tsx", "utf8");
const voiceStylesSource = readFileSync("interfaces/control-center/src/styles/globals.css", "utf8");
const realtimeHookSource = readFileSync("interfaces/control-center/src/components/voice/usePrithaRealtime.ts", "utf8");
const legacyScriptSource = readFileSync("scripts/pritha-voice-control.mjs", "utf8");
const webSearchToolsSource = readFileSync("scripts/web-search-tools.mjs", "utf8");
const voiceRoadmapSource = readFileSync("07_workflows/2026-06-12-control-center-voice-page-roadmap.md", "utf8");
const interfacesManifest = JSON.parse(readFileSync("interfaces/manifest.json", "utf8"));
const legacyExperimentManifest = JSON.parse(readFileSync("interfaces/experiments/pritha-voice-control/manifest.json", "utf8"));
const legacySearchToolName = ["search", "pritha", "memory"].join("_");
const legacyDeepToolName = ["deep", "pritha", "memory"].join("_");

test("Control Center realtime config exposes filesystem inspection for harness questions", () => {
  assert.match(runtimeSource, /name:\s*"full_pritha_memory"/);
  assert.match(runtimeSource, /Query-based search always runs the full retrieval path/);
  assert.doesNotMatch(runtimeSource, new RegExp(`name:\\s*"${legacySearchToolName}"`));
  assert.doesNotMatch(runtimeSource, new RegExp(`name:\\s*"${legacyDeepToolName}"`));
  assert.match(runtimeSource, /name:\s*"inspect_pritha_files"/);
  assert.match(runtimeSource, /enum:\s*\["status", "list_projects", "tree", "file_info", "read_file", "search"\]/);
  assert.match(runtimeSource, /Use inspect_pritha_files for fast read-only filesystem and harness work/);
  assert.match(runtimeSource, /Prefer it over memory tools whenever the operator asks what files exist/);
  assert.match(runtimeSource, /Use full_pritha_memory before answering questions about curated Pritha memory/);
  assert.match(runtimeSource, /do not ask whether the operator wants shallow or deep memory search/);
});

test("Control Center /api/realtime/tool routes inspect_pritha_files to the filesystem handler", () => {
  assert.match(readFileSync("interfaces/control-center/src/lib/voice/tool-service.ts", "utf8"), /handlePrithaRealtimeTool\(\s*name,\s*args/);
  assert.match(toolRouteSource, /executeVoiceTool\(name, payload\.arguments \|\| \{\}, payload\.operation/);
  assert.match(runtimeSource, /if \(name === "inspect_pritha_files"\) \{\s*output = await handlePrithaFiles\(args\);/s);
  assert.match(runtimeSource, /async function handlePrithaFiles\(args: PrithaFilesArgs = \{\}\)/);
  assert.match(runtimeSource, /if \(operation === "read_file"\) return readFilesystemFile\(args\);/);
  assert.match(runtimeSource, /if \(operation === "search"\) return searchFilesystem\(args\);/);
});

test("Voice UI fallback tool list includes filesystem inspection", () => {
  assert.match(voicePageSource, /"full_pritha_memory"/);
  assert.doesNotMatch(voicePageSource, new RegExp(`"${legacySearchToolName}"`));
  assert.doesNotMatch(voicePageSource, new RegExp(`"${legacyDeepToolName}"`));
  assert.match(voicePageSource, /"inspect_pritha_files"/);
  assert.match(voicePageSource, /"recall_rolling_summary"/);
  assert.match(voicePageSource, /"confirm_voice_intake"/);
  assert.match(voicePageSource, /"web_search"/);
  assert.doesNotMatch(voicePageSource, /"recent_external_research"/);
});

test("Voice session start controls use a play icon while stop controls keep the square icon", () => {
  assert.match(voicePageSource, /primaryButtonLabel\(phase, status\) === "Start Listening"/);
  assert.match(voicePageSource, /return <Play size=\{size\} fill="currentColor" \/>/);
  assert.match(voicePageSource, /return <Square size=\{size\} fill="currentColor" \/>/);
  assert.equal(voicePageSource.match(/<PrimaryButtonIcon phase=\{phase\} status=\{status\} size=\{1[78]\} \/>/g)?.length, 2);
});

test("Voice UI task cards stay stable and avoid duplicate approval placeholders", () => {
  assert.match(runtimeSource, /function codexTaskCreatedMs\(taskDir: string\)/);
  assert.match(runtimeSource, /\.sort\(\(a, b\) => b\.createdMs - a\.createdMs/);
  assert.doesNotMatch(runtimeSource, /\.sort\(\(a, b\) => a\.createdMs - b\.createdMs/);
  assert.match(realtimeHookSource, /function orderVisibleCodexTasks/);
  assert.match(realtimeHookSource, /codexTaskCreatedMs\(b\) - codexTaskCreatedMs\(a\)/);
  assert.doesNotMatch(realtimeHookSource, /codexTaskCreatedMs\(a\) - codexTaskCreatedMs\(b\)/);
  assert.doesNotMatch(voicePageSource, /onBriefTask/);
  assert.doesNotMatch(voicePageSource, />\s*Brief\s*</);
  assert.doesNotMatch(voicePageSource, /function DecisionCard/);
  assert.doesNotMatch(voicePageSource, /Decision Gate/);
});

test("Voice UI task progress uses Codex plan step metrics when available", () => {
  assert.match(runtimeSource, /function codexTaskProgressMetrics/);
  assert.match(runtimeSource, /function codexTaskPlanSteps/);
  assert.match(runtimeSource, /phase === "step_completed"/);
  assert.match(runtimeSource, /progress_percent: progressMetrics\.percent/);
  assert.match(runtimeSource, /progress_detail:/);
  assert.match(realtimeHookSource, /progress_percent\?: number/);
  assert.match(realtimeHookSource, /formatCodexProgressDetail/);
  assert.match(realtimeHookSource, /snapshot\.progress_percent === undefined \? fallbackProgress : clampTaskProgress/);
  assert.match(voicePageSource, /title=\{task\.progressDetail \|\| undefined\}/);
});

test("Voice intake sends files and links to bounded temporary Codex analysis", () => {
  assert.match(intakeRouteSource, /multipart\/form-data/);
  assert.match(intakeRouteSource, /createPrithaVoiceIntakeCodexTask/);
  assert.match(intakeRouteSource, /form\.getAll\("files"\)/);
  assert.match(intakeRouteSource, /new Uint8Array\(await entry\.arrayBuffer\(\)\)/);
  assert.match(intakeRouteSource, /error\.includes\("large"\) \|\| error === "too_many_files"/);

  assert.match(runtimeSource, /const VOICE_INTAKE_MAX_FILES = 8/);
  assert.match(runtimeSource, /const VOICE_INTAKE_MAX_FILE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(runtimeSource, /const VOICE_INTAKE_MAX_TOTAL_BYTES = 25 \* 1024 \* 1024/);
  assert.match(runtimeSource, /const VOICE_INTAKE_STAGING_TTL_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(runtimeSource, /function voiceIntakeRoot\(\)/);
  assert.match(runtimeSource, /"temporary-private-staging"/);
  assert.match(runtimeSource, /mode: "ttl"/);
  assert.match(runtimeSource, /terminal_task_readback: false/);
  assert.match(runtimeSource, /ttl_ms: VOICE_INTAKE_STAGING_TTL_MS/);
  assert.match(runtimeSource, /expires_at: expiresAtIso/);
  assert.doesNotMatch(runtimeSource, new RegExp(["terminal", "summary", "readback"].join("_")));
  assert.doesNotMatch(runtimeSource, new RegExp(["terminal", "detail", "readback"].join("_")));
  assert.match(runtimeSource, /isPathInsideOrSame\(intakeRoot, directory\)/);
  assert.match(runtimeSource, /await logPrivateEvent\("voice_intake_staging_purged"/);
  assert.match(runtimeSource, /reason: "ttl_expired"/);
  assert.match(runtimeSource, /task_type: "analysis"/);
  assert.match(runtimeSource, /write_mode: "read_only"/);
  assert.match(runtimeSource, /isVideoOrTranscriptUrl/);
  assert.match(runtimeSource, /scripts\/transcribe-media\.mjs/);
  assert.match(runtimeSource, /Do not store raw uploaded files or full transcripts in tracked memory/);
  assert.match(runtimeSource, /confirmation,/);

  assert.match(voicePageSource, /const CLIENT_INTAKE_MAX_FILES = 8/);
  assert.match(voicePageSource, /const CLIENT_INTAKE_MAX_FILE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(voicePageSource, /const CLIENT_INTAKE_MAX_TOTAL_BYTES = 25 \* 1024 \* 1024/);
  assert.match(voicePageSource, /fetch\("\/api\/realtime\/intake"/);
  assert.match(voicePageSource, /event\.clipboardData\.files/);
  assert.match(voicePageSource, /event\.dataTransfer\.files/);
  assert.match(voicePageSource, /onCodexTaskCreated\(payload\.task_id\)/);
  assert.match(voicePageSource, /realtime\.watchCodexTask\(taskId\)/);

  assert.match(voiceRoadmapSource, /Direct Codex Analysis/);
  assert.match(voiceRoadmapSource, /Document Processor is intentionally not used/);
  assert.doesNotMatch(voiceRoadmapSource, /Evaluate the GitHub Document Processor project/);
});

test("Voice intake requires spoken clarification before Codex upload", () => {
  assert.match(runtimeSource, /name:\s*"confirm_voice_intake"/);
  assert.match(runtimeSource, /You have exactly \$\{toolNames\.length\} tools/);
  assert.match(runtimeSource, /Voice Intake Clarification Pending/);
  assert.match(runtimeSource, /do not call run_codex_task/i);
  assert.match(runtimeSource, /voice_confirmation_required/);
  assert.match(runtimeSource, /\(files\.length > 0 \|\| links\.length > 0\) && !confirmation\.instruction/);
  assert.match(runtimeSource, /Confirmed voice instruction:/);
  assert.match(runtimeSource, /Treat the confirmed voice instruction as the operator's trusted task intent/);
  assert.match(runtimeSource, /write_if_relevant/);
  assert.match(runtimeSource, /music_local_folder/);
  assert.match(runtimeSource, /imports supported audio files into the Music Local Folder library instead of Codex/);

  assert.match(intakeRouteSource, /confirmed_instruction/);
  assert.match(intakeRouteSource, /confirmation_intake_id/);
  assert.match(intakeRouteSource, /voice_confirmation_required/);

  assert.match(realtimeHookSource, /pendingVoiceIntakeRef/);
  assert.match(realtimeHookSource, /formatVoiceIntakeClarificationPrompt/);
  assert.match(realtimeHookSource, /item\.name === "confirm_voice_intake"/);
  assert.match(realtimeHookSource, /beginVoiceIntakeClarification/);
  assert.match(realtimeHookSource, /sendPendingVoiceIntakeClarification\("data_channel_open"\)/);
  assert.match(realtimeHookSource, /Attached file metadata only; file bytes are still local in the browser/);
  assert.match(realtimeHookSource, /intent=music_local_folder/);

  assert.match(voicePageSource, /startVoiceIntakeClarification/);
  assert.match(voicePageSource, /beginVoiceIntakeClarification\(metadata/);
  assert.match(voicePageSource, /if \(routesToCodex\) \{\s*startVoiceIntakeClarification\(\);\s*return;\s*\}/s);
  assert.match(voicePageSource, /form\.set\("confirmed_instruction"/);
  assert.match(voicePageSource, /fetch\("\/api\/music\/library\/import"/);
  assert.match(voicePageSource, /params\.confirmation\.intent === "music_local_folder"/);
  assert.match(voicePageSource, /disabled=\{busy \|\| intakeLocked\}/);
  assert.match(voicePageSource, /Voice gate/);
});

test("Voice Control exposes shared search and research tools while keeping last30days disabled", () => {
  assert.match(runtimeSource, /name:\s*"web_search"/);
  assert.doesNotMatch(runtimeSource, /name:\s*"recent_external_research"/);
  assert.match(runtimeSource, /name === "recent_external_research"/);
  assert.match(runtimeSource, /name:\s*"read_page"/);
  assert.match(runtimeSource, /name:\s*"research_start"/);
  assert.match(runtimeSource, /PRITHA_SEARXNG_URL/);
  assert.match(runtimeSource, /PRITHA_WEB_SEARCH_AUTO_ENSURE/);
  assert.match(runtimeSource, /ensureLocalSearxngSearchBackend/);
  assert.match(runtimeSource, /local_searxng_auto_ensure_ran/);
  assert.match(runtimeSource, /operation=diagnose/);
  assert.match(runtimeSource, /voiceSearch\(/);
  assert.doesNotMatch(runtimeSource, /output = await handleWebSearch\(args\);/);
  assert.match(webSearchToolsSource, /searxng-lock\.json/);
  assert.match(webSearchToolsSource, /install searxng --yes/);
  assert.match(webSearchToolsSource, /start searxng --yes/);
  assert.match(webSearchToolsSource, /binds to 127\.0\.0\.1/);
  assert.match(runtimeSource, /recent_external_research\/last30days remains available in the backend but is intentionally not exposed as an active Realtime tool/);
  assert.match(runtimeSource, /RECENT_RESEARCH_DEFAULT_SOURCES = "reddit,hackernews,polymarket,grounding"/);
  assert.match(runtimeSource, /RECENT_RESEARCH_ALLOWED_SOURCES = new Set\(\["reddit", "hackernews", "polymarket", "grounding", "github", "jobs"\]\)/);
  assert.match(runtimeSource, /output = await handleRecentExternalResearch\(args\);/);
  assert.match(runtimeSource, /external_research:/);
  assert.match(runtimeSource, /last30days_realtime_tool_surface: "disabled"/);
  assert.match(runtimeSource, /web_search: realtimeWebSearchStatus\(\)/);
  assert.match(realtimeHookSource, /sessionData\.tools\.join/);
  assert.doesNotMatch(realtimeHookSource, /recent_external_research/);
  assert.match(voicePageSource, /Web Search/);
  assert.doesNotMatch(voicePageSource, /Recent External Research/);
});

test("Voice task details drawer fits mobile viewport", () => {
  assert.match(voiceStylesSource, /\.voice-drawer\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(voiceStylesSource, /\.voice-drawer\s*\{[^}]*max-width:\s*100vw/s);
  assert.match(voiceStylesSource, /\.voice-drawer\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(voiceStylesSource, /\.drawer-stack pre\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(voiceStylesSource, /\.drawer-kv strong\s*\{[^}]*word-break:\s*break-word/s);
  assert.match(voiceStylesSource, /\.drawer-event-list div,[\s\S]*\.drawer-session-list article\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(voiceStylesSource, /\.drawer-event-list strong\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(voiceStylesSource, /@media \(max-width: 767px\)[\s\S]*\.voice-drawer\s*\{[\s\S]*width:\s*100vw/);
  assert.match(voiceStylesSource, /@media \(max-width: 767px\)[\s\S]*\.voice-drawer\s*\{[\s\S]*height:\s*100dvh/);
  assert.match(voiceStylesSource, /@media \(max-width: 767px\)[\s\S]*\.drawer-actions\s*\{[\s\S]*position:\s*sticky/);
});

test("Voice Codex tasks support linked continuation cards", () => {
  assert.match(runtimeSource, /continue_task_id/);
  assert.match(runtimeSource, /continuation_mode/);
  assert.match(runtimeSource, /continuation_choice_required/);
  assert.match(runtimeSource, /Запускаем новую задачу или скажи короткий ID карточки/);
  assert.match(runtimeSource, /3-character short_id/);
  assert.match(runtimeSource, /history_context/);
  assert.match(runtimeSource, /parent_task_id/);
  assert.match(runtimeSource, /parent_short_id/);
  assert.match(runtimeSource, /new_card_linked_to_parent_history/);
  assert.match(runtimeSource, /answer_codex_task instead of creating a duplicate continuation card/);
  assert.match(runtimeSource, /Use parent_result_excerpt, parent_plan and parent_progress_timeline/);
  assert.match(realtimeHookSource, /parentTaskId/);
  assert.match(realtimeHookSource, /parentShortId/);
  assert.match(realtimeHookSource, /continuation/);
  assert.match(voicePageSource, /Continues:/);
  assert.match(voicePageSource, /Parent task/);
});

test("standalone port 3401 voice experiment is deprecated in favor of Control Center", () => {
  const adapter = interfacesManifest.adapters.find((item) => item.name === "pritha-voice-control");
  assert.equal(adapter.status, "deprecated");
  assert.equal(adapter.replaced_by, "pritha-control-center");
  assert.equal(adapter.replacement_url, "http://127.0.0.1:3420/voice");
  assert.equal(legacyExperimentManifest.status, "deprecated");
  assert.match(legacyScriptSource, /standalone Pritha Voice Control experiment on port 3401 has been retired/);
  assert.match(legacyScriptSource, /http:\/\/127\.0\.0\.1:3420\/voice/);
});
