import { expect, test, type Page, type Route } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

type ControlCenterStatus = {
  app: {
    version: string;
  };
  selfTest: {
    ageLabel: string;
  };
  counts: {
    childAgents: number;
  };
  access: {
    localhost: string;
    tailscale: string;
    tailscaleUrl?: string;
  };
  childAgents: Array<{
    id: string;
    name: string;
    url?: {
      status: "available" | "unavailable";
      local?: string;
      tailscale?: string;
    };
    ui?: {
      state?: string;
      activity?: string;
    };
    control?: {
      planAction?: "start" | "stop" | "check" | "restore";
      primaryCardAction?: "start_plan" | "stop_plan";
    };
    credentials?: {
      definitions: unknown[];
    };
  }>;
};

type OperatorActionPlan = {
  actionEnabled: boolean;
  blockers: string[];
  confirmation?: {
    requiredPhrase?: string;
  };
};

type OperatorActionResult = {
  ok: boolean;
  status: string;
  errors: string[];
  execution?: {
    status: string;
  };
};

type ChildAgent = ControlCenterStatus["childAgents"][number];

async function getStatus(page: Page, fixtureMode?:"active"|"served"|"managed-stop") {
  const response = await page.request.get("/api/status");
  expect(response.ok()).toBeTruthy();
  const status=(await response.json()) as ControlCenterStatus;
  if(fixtureMode) {
    expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe("1");
    const agent=status.childAgents.find(row=>row.id===process.env.PRITHA_E2E_AGENT_ID);
    expect(agent,"The isolated inert agent fixture must exist").toBeTruthy();
    agent!.ui={...agent!.ui,activity:"active"};
    if(fixtureMode==="served") {
      status.access={...status.access,tailscale:"ready",tailscaleUrl:"https://pritha-e2e.example.invalid"};
      agent!.url={...agent!.url,status:"available",tailscale:"https://agent-e2e.example.invalid"};
      status.childAgents.push({...agent!,id:"agent-e2e-unserved",name:"Unserved fixture",url:{...agent!.url!,tailscale:undefined}});
    } else if(fixtureMode==="managed-stop")agent!.control={...agent!.control,planAction:"stop",primaryCardAction:"stop_plan"};
    // Rendering fixtures only. Neither service startup nor a Tailscale action
    // is dispatched; real manager ownership is covered by process contract tests.
    await page.route("**/api/status",route=>route.fulfill({contentType:"application/json",body:JSON.stringify(status)}));
  }
  return status;
}

test.beforeEach(async({request})=>{
  expect(process.env.PRITHA_E2E_ISOLATED_STATE,"Use an explicitly isolated E2E state").toBe("1");
  const health=await (await request.get("/api/health")).json();
  expect(health.instance?.id).toMatch(/e2e|fixture|test/);expect(health.instance?.role).toBe("development");
  expect(health.instance?.id).toBe(process.env.PRITHA_INSTANCE_ID);
});

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
    .toBeTruthy();
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".codex-transcript")]
      .filter((element) => element.offsetParent !== null)
      .every((element) => element.scrollWidth <= element.clientWidth + 2)))
    .toBeTruthy();
}

async function expectNoRawSecret(page: Page) {
  const text = (await page.locator("body").textContent()) || "";
  expect(text).not.toMatch(/(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/);
  expect(text).not.toMatch(/OPENAI_API_KEY\s*=\s*[^*\s]{8,}/);
}

function findRepoRoot() {
  let cursor = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(cursor, "AGENTS.md")) && existsSync(path.join(cursor, "interfaces", "control-center"))) return cursor;
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  return path.resolve(process.cwd(), "../..");
}

function writeFakeCodexTask(status: string) {
  const taskId = `test-${status}-${Date.now()}`;
  const taskDir = path.join(realtimePrivateRoot(), "codex-tasks", taskId);
  const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const completedAt = new Date().toISOString();
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(
    path.join(taskDir, "request.json"),
    `${JSON.stringify(
      {
        id: taskId,
        created_at: startedAt,
        status,
        task: "Synthetic Codex timeout regression task",
        task_type: "analysis",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(taskDir, "status.json"),
    `${JSON.stringify(
      {
        status,
        phase: "stale_repaired",
        started_at: startedAt,
        completed_at: completedAt,
        updated_at: completedAt,
        timeout_ms: 1_000,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(taskDir, "result.md"), "");
  writeFileSync(
    path.join(taskDir, "progress.jsonl"),
    `${JSON.stringify({ timestamp: startedAt, phase: "runner_started", level: "info", status: "running", message: "Synthetic task started." })}\n${JSON.stringify({ timestamp: completedAt, phase: "stale_repaired", level: "error", status, message: "Synthetic task timed out." })}\n`,
  );
  return { taskId, taskDir };
}

function writeStaleCodexTask() {
  const taskId = `test-stale-running-${Date.now()}`;
  const taskDir = path.join(realtimePrivateRoot(), "codex-tasks", taskId);
  const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(
    path.join(taskDir, "request.json"),
    `${JSON.stringify(
      {
        id: taskId,
        created_at: startedAt,
        status: "running",
        task: "Synthetic stale Codex runner regression task",
        task_type: "analysis",
        effective_transport: "codex-cli",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(taskDir, "status.json"),
    `${JSON.stringify(
      {
        status: "running",
        phase: "runner_started",
        transport: "codex-cli",
        pid: 999999,
        started_at: startedAt,
        timeout_ms: 1_000,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(taskDir, "result.md"), "");
  writeFileSync(
    path.join(taskDir, "progress.jsonl"),
    `${JSON.stringify({ timestamp: startedAt, phase: "runner_started", level: "info", status: "running", transport: "codex-cli", message: "Synthetic stale task started." })}\n`,
  );
  return { taskId, taskDir };
}

async function setAccessMode(page: Page, mode: "localhost" | "lan" | "tailscale") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("pritha.defaultAccessMode", value);
    document.cookie = `pritha.defaultAccessMode=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }, mode);
}

function restoreFile(pathname: string, content: string | null) {
  if (content === null) {
    rmSync(pathname, { force: true });
    return;
  }
  writeFileSync(pathname, content);
}

function realtimePrivateRoot() {
  const stateRoot = process.env.PRITHA_STATE_ROOT?.trim();
  if (stateRoot) return path.join(stateRoot, "private", "interface-lab", "pritha-control-center", "realtime");
  const root = findRepoRoot();
  try {
    const configured = readFileSync(path.join(root, ".env.local"), "utf8")
      .split(/\r?\n/)
      .find((line) => /^PRITHA_STATE_ROOT=/.test(line))
      ?.slice("PRITHA_STATE_ROOT=".length)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (configured && path.isAbsolute(configured)) {
      return path.join(configured, "private", "interface-lab", "pritha-control-center", "realtime");
    }
  } catch {
    // Fresh checkouts without an instance pointer keep using the repository-local fixture root.
  }
  return path.join(root, ".private", "interface-lab", "pritha-control-center", "realtime");
}

test.describe("Control Center UI regression", () => {
  test("renders all primary tabs without console errors, page overflow, or raw secrets", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of ["/agents", "/voice", "/task-chat", "/codex", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator("h1:visible").first()).toBeVisible();
      if (route === "/task-chat" || route === "/codex") await expect(page.locator(".codex-conversation-header:visible")).toContainText("Pritha");
      else await expect(page.locator(".status-strip:visible")).toContainText("Pritha");
      await expectNoPageOverflow(page);
      await expectNoRawSecret(page);
    }

    expect(consoleErrors).toEqual([]);
  });

  test("Task Chat maps an empty gateway failure to a friendly desktop and mobile stale state", async ({ page }) => {
    await page.route("**/api/codex-chat/v1/**", async (route) => {
      await route.fulfill({ status: 502, contentType: "application/json", body: "" });
    });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/task-chat");
      await expect(page.locator(".codex-error-banner")).toContainText("Control Center is temporarily unavailable");
      await expect(page.locator("body")).not.toContainText("Unexpected end of JSON input");
      await expect(page.locator("body")).not.toContainText("Failed to execute 'json'");
      await expectNoPageOverflow(page);
    }
  });

  test("Task Chat heals one transient bootstrap failure without flashing a red availability banner", async ({ page }) => {
    const now = new Date().toISOString();
    let runtimeAttempts = 0;
    await page.route("**/api/codex-chat/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "POST" && url.pathname.endsWith("/ui-activity")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "transient-ui", data: { recorded: true } }) });
      }
      if (url.pathname.endsWith("/runtime")) {
        runtimeAttempts += 1;
        if (runtimeAttempts === 1) return route.fulfill({ status: 502, contentType: "application/json", body: "" });
        const runtime = {
          preferredProvider: "neuraldeep_cli",
          effectiveProvider: "neuraldeep_cli",
          effectiveProtocol: "exec_resume",
          availability: "ready",
          fallbackEnabled: false,
          providers: [{
            providerId: "neuraldeep_cli",
            label: "NeuralDeep through isolated Codex CLI",
            availability: "ready",
            version: "test",
            protocol: "exec_resume",
            locationLabel: "NeuralDeep Codex CLI",
            stateIdentityHash: "eeeeeeeeeeeeeeeeeeeeeeee",
            capabilities: {},
            warning: null,
            providerState: "available",
          }],
          models: [],
          selected: { modelId: "qwen3.6-35b-a3b", effortId: "medium", serviceTierId: null, sandboxMode: "workspace_write", approvalMode: "never" },
          probedAt: now,
          provider: "neuraldeep",
          providerState: "available",
        };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "transient-runtime", data: runtime }) });
      }
      if (url.pathname.endsWith("/threads")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "transient-threads", data: { data: [], nextCursor: null } }) });
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });

    await page.goto("/task-chat");
    await expect.poll(() => runtimeAttempts).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".codex-runtime-pill")).toContainText("Ready");
    await expect(page.locator(".codex-error-banner")).toHaveCount(0);
  });

  test("Task Chat separates direct chats from persistent Voice tasks and enables continuation explicitly", async ({ page }) => {
    const now = new Date().toISOString();
    let continuationEnabled = false;
    let voiceListRequests = 0;
    let secondVoiceHistoryAttempts = 0;
    let createThreadRequests = 0;
    let existingThreadTurnRequests = 0;
    let directMetadataRequests = 0;
    let failNextDirectMetadata = false;
    const newThreadBodies: Array<Record<string, unknown>> = [];
    let delayNextDirectList = false;
    let resolveDelayedDirectListStarted: (() => void) | null = null;
    let releaseDelayedDirectList: () => void = () => undefined;
    let delayedDirectListGate: Promise<void> = Promise.resolve();
    const uiActivity: Array<Record<string, unknown>> = [];
    const capabilities = {
      fullChat: true,
      nativeHistory: true,
      listThreads: false,
      readThread: false,
      forkThread: false,
      archiveThread: false,
      unarchiveThread: false,
      renameThread: false,
      pinThread: false,
      steerTurn: false,
      interruptTurn: true,
      commandApprovals: false,
      fileChangeApprovals: false,
      permissionApprovals: false,
      requestUserInput: false,
      historyPagination: true,
      audioInput: false,
    };
    const runtime = {
      preferredProvider: "neuraldeep_cli",
      effectiveProvider: "neuraldeep_cli",
      effectiveProtocol: "exec_resume",
      availability: "ready",
      fallbackEnabled: false,
      providers: [{
        providerId: "neuraldeep_cli",
        label: "NeuralDeep through isolated Codex CLI",
        availability: "ready",
        version: "test",
        protocol: "exec_resume",
        locationLabel: "NeuralDeep Codex CLI",
        stateIdentityHash: "eeeeeeeeeeeeeeeeeeeeeeee",
        capabilities,
        warning: null,
        providerState: "available",
      }],
      models: [],
      selected: { modelId: "qwen3.6-35b-a3b", effortId: "medium", serviceTierId: null, sandboxMode: "workspace_write", approvalMode: "never" },
      probedAt: now,
      provider: "neuraldeep",
      providerState: "available",
    };
    const runtimeBinding = (sessionId: string | null) => ({
      providerId: "neuraldeep_cli",
      version: "test",
      protocol: "exec_resume",
      stateIdentityHash: "eeeeeeeeeeeeeeeeeeeeeeee",
      compatibility: "bound",
      provider: "neuraldeep",
      model: "qwen3.6-35b-a3b",
      sessionId,
      providerState: "available",
    });
    const base = {
      preview: "",
      status: "idle",
      activeFlags: [],
      pinned: false,
      archived: false,
      historyKind: "mirrored",
      createdAt: now,
      updatedAt: now,
    };
    const direct = { ...base, chatId: "chat-direct", title: "Direct example", group: "my_chats", origin: "chat", runtime: runtimeBinding("session-direct"), taskLinks: [], continuationState: "continuation_enabled" };
    const newDirect = { ...base, chatId: "chat-new", title: "First atomic task", preview: "First atomic task", status: "active", group: "my_chats", origin: "chat", runtime: runtimeBinding("session-new"), taskLinks: [], continuationState: "continuation_enabled" };
    const newTurn = {
      turnId: "turn-new",
      clientMessageId: "client-message-new",
      status: "in_progress",
      userMessage: { id: "message-new", role: "user", markdown: "First atomic task", status: "completed", createdAt: now },
      items: [{ id: "legacy-empty-error", kind: "unsupported", label: "error", status: "completed", startedAt: now, completedAt: now }],
      pendingRequestIds: [], startedAt: now, completedAt: null, error: null,
    };
    const newDetail = { thread: newDirect, activeTurnId: "turn-new", pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-new/events", continuationState: "continuation_enabled" };
    const voice = () => ({
      ...base,
      chatId: "chat-voice",
      title: "Voice example",
      group: "voice_work",
      origin: "voice",
      runtime: runtimeBinding("session-voice"),
      taskLinks: [{ taskId: "task-one", shortId: "ONE", label: "Voice task", origin: "voice", mode: continuationEnabled ? "shared_thread" : "result_reference", subjectScope: { kind: "pritha", id: "pritha", label: "Pritha", generation: 1 }, status: "complete", linkedAt: now }],
      continuationState: continuationEnabled ? "continuation_enabled" : "read_only",
    });
    const secondVoice = { ...voice(), chatId: "chat-voice-second", title: "Voice pagination example", runtime: runtimeBinding("session-voice-second"), taskLinks: [{ ...voice().taskLinks[0], taskId: "task-two", shortId: "TWO" }] };

    await page.route("**/api/codex-chat/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/attachments")) return route.continue();
      if (route.request().method() === "POST" && url.pathname.endsWith("/ui-activity")) {
        uiActivity.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "task-chat-telemetry", data: { recorded: true } }) });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/threads")) {
        createThreadRequests += 1;
        newThreadBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        if (createThreadRequests === 1) {
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ apiVersion: "1", error: { code: "fallback_confirmation_required", message: "First-message delivery is unknown.", retryable: true, requestId: "new-chat-unknown" } }),
          });
        }
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ apiVersion: "1", requestId: "new-chat-accepted", replayed: true, data: { detail: newDetail, accepted: { turn: newTurn, streamUrl: newDetail.streamUrl } } }),
        });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/turns")) {
        existingThreadTurnRequests += 1;
        const knownRejection = url.pathname.includes("/chat-direct/");
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            apiVersion: "1",
            error: {
              code: knownRejection ? "turn_start_rejected" : "fallback_confirmation_required",
              message: knownRejection
                ? "The task runtime rejected the message before accepting it. The thread was not changed."
                : "The connection ended before delivery could be confirmed. Check history before retrying the same message.",
              retryable: true,
              requestId: knownRejection ? "task-chat-not-accepted" : "task-chat-delivery-unknown",
            },
          }),
        });
      }
      if (url.pathname.endsWith("/events")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ready\n\n" });
      if (route.request().method() === "POST" && url.pathname.endsWith("/task-links")) continuationEnabled = true;
      let data: unknown;
      if (url.pathname.endsWith("/runtime")) data = runtime;
      else if (url.pathname.endsWith("/threads")) {
        const group = url.searchParams.get("group");
        const cursor = url.searchParams.get("cursor");
        if (group === "voice_work") voiceListRequests += 1;
        if (group === "my_chats" && delayNextDirectList) {
          delayNextDirectList = false;
          resolveDelayedDirectListStarted?.();
          await delayedDirectListGate;
        }
        data = group === "voice_work"
          ? cursor === "voice-page-2"
            ? { data: [secondVoice], nextCursor: null, sync: { state: "ready", lastCompletedAt: now } }
            : { data: [voice()], nextCursor: "voice-page-2", sync: { state: "ready", lastCompletedAt: now } }
          : { data: [direct], nextCursor: null };
      } else if (url.pathname.endsWith("/history")) {
        if (url.pathname.includes("/chat-new/")) {
          data = { data: [newTurn], olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false, snapshotAt: now };
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "task-chat-new-history", data }) });
        }
        if (url.pathname.includes("/chat-voice-second/")) {
          secondVoiceHistoryAttempts += 1;
          if (secondVoiceHistoryAttempts === 1) {
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            return route.fulfill({ status: 504, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", error: { code: "history_timeout_test", message: "History test timeout.", retryable: true, requestId: "task-chat-history-timeout" } }) });
          }
        }
        data = { data: [], olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false, snapshotAt: now };
      } else if (url.pathname.endsWith("/chat-direct")) {
        directMetadataRequests += 1;
        if (directMetadataRequests === 1 || failNextDirectMetadata) {
          failNextDirectMetadata = false;
          return route.fulfill({ status: 502, contentType: "application/json", body: "" });
        }
        data = { thread: direct, activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-direct/events", continuationState: "continuation_enabled" };
      }
      else if (url.pathname.endsWith("/chat-new")) data = newDetail;
      else if (url.pathname.endsWith("/chat-voice") || url.pathname.endsWith("/task-links")) data = { thread: voice(), activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-voice/events", continuationState: continuationEnabled ? "continuation_enabled" : "read_only" };
      else if (url.pathname.endsWith("/chat-voice-second")) data = { thread: secondVoice, activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-voice-second/events", continuationState: "read_only" };
      else return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "task-chat-e2e", data }) });
    });

    await page.goto("/task-chat");
    await expect(page.getByRole("button", { name: /Direct example/ })).toBeVisible();
    await expect.poll(() => directMetadataRequests).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".codex-history-failed")).toHaveCount(0);
    await expect(page.locator(".codex-error-banner")).toHaveCount(0);
    const directMetadataBeforeFocus = directMetadataRequests;
    failNextDirectMetadata = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => directMetadataRequests).toBeGreaterThanOrEqual(directMetadataBeforeFocus + 2);
    await expect(page.locator(".codex-error-banner")).toHaveCount(0);
    await expect(page.getByText("Voice example")).toHaveCount(0);
    await page.getByRole("tab", { name: "Voice Tasks" }).click();
    await expect(page.getByRole("button", { name: /Voice example/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Voice pagination example/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue in Task Chat" })).toBeVisible();
    const listRequestsBeforeTap = voiceListRequests;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open chat history" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("button", { name: /Voice pagination example/ }).click();
    await expect(page.locator(".codex-title-line h1")).toHaveText("Voice pagination example");
    await expect(page.locator(".codex-history-loading")).toBeVisible();
    await expect(page.locator(".codex-history-failed")).toBeVisible();
    expect(voiceListRequests).toBe(listRequestsBeforeTap);
    await expect.poll(() => uiActivity.find((event) => event.event === "thread_selected" && event.source === "history_row") || null).not.toBeNull();
    await page.getByRole("button", { name: "Retry history" }).click();
    await expect(page.getByRole("button", { name: "Continue in Task Chat" })).toBeVisible();
    await expect.poll(() => uiActivity.some((event) => event.source === "retry" && event.event === "history_loaded")).toBe(true);

    await page.getByRole("button", { name: "Open chat history" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("button", { name: /^Voice example/ }).click();
    await page.getByRole("button", { name: "Continue in Task Chat" }).click();
    await expect(page.getByRole("textbox", { name: "Message Pritha", exact: true })).toBeVisible();

    const voiceDraft = "Keep this retry attached only to the Voice thread";
    await page.locator(".codex-composer textarea").fill(voiceDraft);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".codex-delivery-unknown")).toBeVisible();
    await expect(page.locator(".codex-error-banner")).toHaveCount(0);
    await page.getByRole("button", { name: "Open chat history" }).click();
    const drawer = page.locator('[aria-label="Task Chat history drawer"]');
    await drawer.getByRole("tab", { name: "Direct Chats" }).click();
    await drawer.getByRole("button", { name: /Direct example/ }).click();
    await expect(page.locator(".codex-composer textarea")).toHaveValue("");
    await page.locator(".codex-composer textarea").fill("This rejection is known not to be delivered");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".codex-error-banner")).toContainText("rejected the message before accepting it");
    expect(existingThreadTurnRequests).toBeGreaterThan(0);

    await page.goto("/codex?group=voice_work&chat=chat-voice");
    await expect(page).toHaveURL(/\/task-chat\?group=voice_work&chat=chat-voice$/);
    await page.getByRole("button", { name: "Open chat history" }).click();
    const redirectedDrawer = page.locator('[aria-label="Task Chat history drawer"]');
    await expect(redirectedDrawer.getByRole("tab", { name: "Voice Tasks" })).toHaveAttribute("aria-selected", "true");
    await expectNoPageOverflow(page);

    const delayedDirectListStarted = new Promise<void>((resolve) => { resolveDelayedDirectListStarted = resolve; });
    delayedDirectListGate = new Promise<void>((resolve) => { releaseDelayedDirectList = resolve; });
    delayNextDirectList = true;
    await redirectedDrawer.getByRole("tab", { name: "Direct Chats" }).click();
    await delayedDirectListStarted;
    await redirectedDrawer.getByRole("button", { name: "New chat" }).click();
    const existingTurnRequestsBeforeNewChat = existingThreadTurnRequests;
    await page.locator(".codex-composer textarea").fill("First atomic task");
    releaseDelayedDirectList();
    await expect(page.locator(".codex-title-line h1")).toHaveText("Task Chat");
    await expect(page.locator(".codex-composer textarea")).toHaveValue("First atomic task");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".codex-delivery-unknown")).toBeVisible();
    await expect(page.locator(".codex-error-banner")).toHaveCount(0);
    expect(createThreadRequests).toBe(1);
    expect(existingThreadTurnRequests).toBe(existingTurnRequestsBeforeNewChat);
    await page.getByRole("button", { name: "Check and retry same message" }).click();
    await expect(page.locator(".codex-title-line h1")).toHaveText("First atomic task");
    await expect(page.locator(".codex-activity-row", { hasText: "error" })).toHaveCount(0);
    expect(createThreadRequests).toBe(2);
    expect(newThreadBodies[1]).toEqual(newThreadBodies[0]);
    expect(newThreadBodies[0]).toMatchObject({ source: "chat", initialTurn: { input: [{ type: "text", text: "First atomic task" }] } });
  });

  test("keeps a long Codex transcript scrollable, the composer reachable, and dictation language browser-local", async ({ page }) => {
    await page.addInitScript(() => {
      class TestSpeechRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        onresult: null = null;
        onend: null = null;
        onerror: null = null;
        start() {}
        stop() {}
      }
      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: TestSpeechRecognition });
    });

    const now = new Date().toISOString();
    const capabilities = {
      fullChat: true,
      nativeHistory: true,
      listThreads: true,
      readThread: true,
      forkThread: false,
      archiveThread: false,
      unarchiveThread: false,
      renameThread: false,
      pinThread: false,
      steerTurn: false,
      interruptTurn: false,
      commandApprovals: false,
      fileChangeApprovals: false,
      permissionApprovals: false,
      requestUserInput: false,
      historyPagination: true,
      audioInput: false,
    };
    const runtime = {
      preferredProvider: "neuraldeep_cli",
      effectiveProvider: "neuraldeep_cli",
      effectiveProtocol: "exec_resume",
      availability: "ready",
      fallbackEnabled: false,
      providers: [{
        providerId: "neuraldeep_cli",
        label: "NeuralDeep through isolated Codex CLI",
        availability: "ready",
        version: "test",
        protocol: "exec_resume",
        locationLabel: "NeuralDeep Codex CLI",
        stateIdentityHash: "eeeeeeeeeeeeeeeeeeeeeeee",
        capabilities,
        warning: null,
      }],
      models: [],
      selected: {
        modelId: "gpt-test",
        effortId: null,
        serviceTierId: null,
        sandboxMode: "read_only",
        approvalMode: "never",
      },
      probedAt: now,
      provider: "neuraldeep",
      providerState: "available",
    };
    const thread = {
      chatId: "chat-long",
      title: "Long layout verification",
      preview: "Long transcript",
      group: "my_chats",
      origin: "chat",
      status: "idle",
      activeFlags: [],
      pinned: false,
      archived: false,
      historyKind: "mirrored",
      createdAt: now,
      updatedAt: now,
      runtime: {
        providerId: "neuraldeep_cli",
        version: "test",
        protocol: "exec_resume",
        stateIdentityHash: "eeeeeeeeeeeeeeeeeeeeeeee",
        compatibility: "bound",
        provider: "neuraldeep",
        model: "qwen3.6-35b-a3b",
        sessionId: "session-long",
        providerState: "available",
      },
      taskLinks: [],
      continuationState: "continuation_enabled",
    };
    const turns = Array.from({ length: 18 }, (_, index) => ({
      turnId: `turn-${index}`,
      clientMessageId: `client-${index}`,
      status: "completed",
      userMessage: {
        id: `user-${index}`,
        role: "user",
        markdown: `User message ${index + 1}: verify that a long conversation keeps its input visible.`,
        status: "completed",
        createdAt: now,
      },
      items: [{
        id: `assistant-item-${index}`,
        kind: "assistant_message",
        status: "completed",
        startedAt: now,
        completedAt: now,
        message: {
          id: `assistant-${index}`,
          role: "assistant",
          markdown: `Assistant response ${index + 1}. This intentionally adds enough content to require internal transcript scrolling.`,
          status: "completed",
          createdAt: now,
        },
      }],
      pendingRequestIds: [],
      startedAt: now,
      completedAt: now,
      error: null,
    }));

    await page.route("**/api/codex-chat/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const requestId = `e2e-${url.pathname}`;
      if (url.pathname.endsWith("/events")) {
        await route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ready\n\n" });
        return;
      }
      let data: unknown;
      if (url.pathname.endsWith("/runtime")) data = runtime;
      else if (url.pathname.endsWith("/threads")) data = { data: [thread], nextCursor: null };
      else if (url.pathname.endsWith("/history")) data = { data: turns, olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false, completeness:"captured-from-creation", snapshotAt: now };
      else if (url.pathname.endsWith("/chat-long")) data = { thread, activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-long/events" };
      else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", error: { code: "not_found", message: "Not found", retryable: false, requestId } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId, data }) });
    });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/task-chat");
      const transcript = page.locator(".codex-transcript");
      const composer = page.locator(".codex-composer-wrap");
      await expect(page.getByText("Assistant response 18.")).toBeVisible();
      await expect(composer).toBeVisible();
      const layout = await transcript.evaluate((element) => {
        const transcriptRect = element.getBoundingClientRect();
        const composerElement = document.querySelector<HTMLElement>(".codex-composer-wrap");
        const composerRect = composerElement?.getBoundingClientRect();
        return {
          transcriptClientHeight: element.clientHeight,
          transcriptScrollHeight: element.scrollHeight,
          transcriptBottom: transcriptRect.bottom,
          composerTop: composerRect?.top || 0,
          composerBottom: composerRect?.bottom || 0,
          viewportHeight: window.innerHeight,
        };
      });
      expect(layout.transcriptScrollHeight).toBeGreaterThan(layout.transcriptClientHeight);
      expect(layout.transcriptBottom).toBeLessThanOrEqual(layout.composerTop + 1);
      expect(layout.composerBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
      await transcript.evaluate((element) => { element.scrollTop = 0; });
      await expect(composer).toBeVisible();
      await expectNoPageOverflow(page);
    }

    const language = page.getByLabel("Dictation language");
    await language.selectOption("ru-RU");
    await page.reload();
    await expect(language).toHaveValue("ru-RU");
  });

  test("keeps agents filters, credentials drawer, create-plan drawer, and voice-link modal interactive", async ({ page }) => {
    const status = await getStatus(page);
    await page.goto("/agents");

    await page.getByRole("button", { name: "All" }).click();
    await expect(page.getByTestId("agent-filter-toolbar")).toContainText(/\d+ shown/);
    expect(status.counts.childAgents).toBeGreaterThanOrEqual(0);

    const credentialAgent = status.childAgents.find((agent) => agent.credentials?.definitions.length);
    if (!credentialAgent) {
      test.skip(true, "No credential-enabled child agent in current registry.");
      return;
    }

    const desktopAgents = page.locator(".agents-desktop-content");
    await desktopAgents.locator(`[data-testid="agent-credentials-button"][data-agent-id="${credentialAgent.id}"]`).first().click();
    await expect(page.getByTestId("credentials-panel")).toBeVisible();
    await expect(page.getByTestId("credentials-panel")).toHaveAttribute("data-agent-id", credentialAgent.id);
    await expectNoRawSecret(page);

    await page.getByRole("button", { name: "Close credentials panel" }).click();
    await desktopAgents.getByTestId("create-agent-plan-button").click();
    await expect(page.locator('[aria-label="Open in Task Chat / Create Plan"]')).toBeVisible();

    await page.getByRole("button", { name: "Close create plan panel" }).click();
    await page.locator(".access-card button").click();
    await expect(page.locator(".access-modal")).toBeVisible();
    await expect(page.locator(".access-modal")).toContainText("Voice Link");
  });

  test("keeps agent card URLs aligned with localhost access mode", async ({ page }) => {
    const status = await getStatus(page,"active");
    const agent = status.childAgents.find((item) => item.url?.local && item.ui?.state === "alive");
    if (!agent?.url?.local) {
      test.skip(true, "No alive child agent with a local URL in current registry.");
      return;
    }

    await setAccessMode(page, "localhost");
    await page.goto("/agents");
    const allButton = page.getByRole("button", { name: "All" });
    if (await allButton.isEnabled().catch(() => false)) await allButton.click();
    await page.evaluate(()=>window.dispatchEvent(new Event("pritha:status-refresh")));
    const localLink = page.locator(`[data-testid="agent-url-link"][data-agent-id="${agent.id}"]`).first();
    await expect(localLink).toHaveAttribute("data-url", agent.url.local);
  });

  test("uses served child-agent URLs for Tailscale access mode without inventing unserved links", async ({ page }) => {
    const status = await getStatus(page,"served");
    const agent = status.childAgents.find((item) => item.url?.local && item.url?.tailscale && item.ui?.state === "alive");
    if (!agent?.url?.local || !agent.url.tailscale) {
      test.skip(true, "No alive child agent with a served Tailscale URL in current registry.");
      return;
    }

    if (status.access.tailscale !== "ready" || !status.access.tailscaleUrl) {
      test.skip(true, "Tailscale access is not ready in current Control Center status.");
      return;
    }

    await setAccessMode(page, "tailscale");
    await page.goto("/agents");
    const allButton = page.getByRole("button", { name: "All" });
    if (await allButton.isEnabled().catch(() => false)) await allButton.click();
    await page.evaluate(()=>window.dispatchEvent(new Event("pritha:status-refresh")));
    const localLink = page.locator(`[data-testid="agent-url-link"][data-agent-id="${agent.id}"]`).first();
    await expect(localLink).toHaveAttribute("data-url", agent.url.tailscale);

    const unservedAgent = status.childAgents.find((item) => item.url?.local && !item.url?.tailscale && item.ui?.state === "alive");
    if (unservedAgent) {
      const statusLink=page.locator(`[data-testid="agent-url-link"][data-agent-id="${unservedAgent.id}"]`).first();
      await expect(statusLink).toHaveAttribute("data-url",`https://pritha-e2e.example.invalid/agents/${unservedAgent.id}`);
      await expect(statusLink.locator('..')).toContainText("Status page");
    }
  });

  test("keeps active managed agents on Stop Plan while URL opening stays secondary", async ({ page }) => {
    const status = await getStatus(page,"managed-stop");
    const agent = status.childAgents.find((item) => item.url?.local && item.ui?.state === "alive" && item.control?.planAction === "stop");
    if (!agent?.url?.local) {
      test.skip(true, "No active managed child agent with a local URL in current registry.");
      return;
    }

    await setAccessMode(page, "localhost");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agents");

    const card = page.locator(".mobile-agent-card", { hasText: agent.name }).first();
    await page.getByRole("button",{name:"All",exact:true}).click();
    await page.evaluate(()=>window.dispatchEvent(new Event("pritha:status-refresh")));
    await expect(card.locator("button.mobile-agent-action")).toContainText("Stop Plan");
    await expect(card.locator('[data-testid="agent-primary-open-link"]')).toHaveCount(0);
    await expect(card.locator(`[data-testid="agent-url-link"][data-agent-id="${agent.id}"]`)).toHaveAttribute("data-url", agent.url.local);
  });

  test("keeps manual confirmation phrase input editable even when start execution is blocked", async ({ page }) => {
    const status = await getStatus(page);
    const startAgent = status.childAgents.find((item) => item.id === "stupid-joke" && item.control?.planAction === "start")
      || status.childAgents.find((item) => item.control?.planAction === "start");
    if (!startAgent) {
      test.skip(true, "A managed start-plan agent is required for this confirmation UI check.");
      return;
    }

    async function openStartPlan(agent: ChildAgent) {
      await page.goto("/agents");
      await page.getByRole("button", { name: "All" }).click();
      const card = page.locator(".agents-desktop-content .agent-card", { hasText: agent.name }).first();
      await expect(card).toBeVisible();

      const planResponse = page.waitForResponse((response) =>
        response.url().includes(`/api/agents/${agent.id}/actions/start/plan`) && response.ok(),
      );
      await card.locator("button.agent-action").click();
      const plan = (await (await planResponse).json()) as OperatorActionPlan;
      const requiredPhrase = plan.confirmation?.requiredPhrase || "";
      expect(requiredPhrase).toBeTruthy();

      const panel = page.locator(".operator-action-panel", { hasText: agent.name });
      await expect(panel).toBeVisible();
      await expect(panel.locator(".operator-confirmation-copy strong")).toHaveText(requiredPhrase);

      const input = panel.locator(".operator-confirmation-input input");
      await expect(input).toBeEditable();
      await input.fill(requiredPhrase);
      await expect(input).toHaveValue(requiredPhrase);

      return {
        actionEnabled: plan.actionEnabled,
        startButton: panel.getByRole("button", { name: "Start" }),
      };
    }

    const planPattern = `**/api/agents/${startAgent.id}/actions/start/plan`;
    const forceBlockedPlan = async (route: Route) => {
      const response = await route.fetch();
      const plan = (await response.json()) as OperatorActionPlan;
      await route.fulfill({
        response,
        contentType: "application/json",
        body: JSON.stringify({ ...plan, actionEnabled: false, blockers: [...plan.blockers, "E2E confirmation fixture blocker."] }),
      });
    };
    await page.route(planPattern, forceBlockedPlan);
    const blockedPlan = await openStartPlan(startAgent);
    expect(blockedPlan.actionEnabled).toBe(false);
    await expect(blockedPlan.startButton).toBeDisabled();

    await page.unroute(planPattern, forceBlockedPlan);
    const executablePlan = await openStartPlan(startAgent);
    expect(executablePlan.actionEnabled).toBe(true);
    await expect(executablePlan.startButton).toBeEnabled();
  });

  test("guards start and stop actions behind blockers or exact confirmation", async ({ page }) => {
    const status = await getStatus(page);
    const agent = status.childAgents[0];
    if (!agent) {
      test.skip(true, "No child agents in current registry.");
      return;
    }
    const auditPath = path.join(findRepoRoot(), ".snapshots", "audit", "child-agent-operator-actions.jsonl");
    const originalAudit = existsSync(auditPath) ? readFileSync(auditPath, "utf8") : null;

    try {
      const planResponse = await page.request.get(`/api/agents/${encodeURIComponent(agent.id)}/actions/start/plan`);
      expect(planResponse.ok()).toBeTruthy();
      const plan = (await planResponse.json()) as OperatorActionPlan;

      const resultResponse = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/actions/start`, {
        data: { confirmation: "wrong-confirmation-phrase" },
      });
      expect(resultResponse.ok()).toBeTruthy();
      const result = (await resultResponse.json()) as OperatorActionResult;

      expect(["blocked", "pending_confirmation"]).toContain(result.status);
      expect(result.execution?.status).toBe(plan.actionEnabled ? "pending_confirmation" : "blocked");
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      restoreFile(auditPath, originalAudit);
    }

    const runtimeAgent = status.childAgents.find((item) => item.control?.planAction === "start" || item.control?.planAction === "stop");
    if (!runtimeAgent) return;

    await page.goto("/agents");
    await page.getByRole("button", { name: "All" }).click();
    await page.locator(".agents-desktop-content .agent-card", { hasText: runtimeAgent.name }).first().locator("button.agent-action").click();
    await expect(page.locator('[aria-label*="for"]').filter({ hasText: runtimeAgent.name })).toBeVisible();
    await expect(page.getByText("Manual Confirmation")).toBeVisible();
    await expect(page.getByText("Required phrase")).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test("shows backend-driven Settings and Dev status instead of stale mock labels", async ({ page }) => {
    const status = await getStatus(page);

    await page.goto("/settings");
    await expect(page.locator(".summary-card").first()).toContainText(status.app.version);
    await expect(page.locator(".summary-card").first()).toContainText(status.selfTest.ageLabel);
    await expect(page.locator(".summary-card").first()).not.toContainText("2h 13m");
    await expect(page.locator(".summary-card").first()).not.toContainText("2 hours ago");

    await page.goto("/dev");
    await expect(page.locator(".readiness-panel").first()).toContainText(`Last self-test: ${status.selfTest.ageLabel}`);
    await expect(page.locator(".readiness-panel").first()).not.toContainText("Last self-test: 2h ago");
  });

  test("shows NeuralDeep billing controls and keeps existing chats pinned when a priced model is selected", async ({ page }) => {
    const isolatedStateRoot = process.env.PRITHA_STATE_ROOT?.trim();
    const isolatedPort = process.env.PRITHA_CONTROL_CENTER_PORT?.trim();
    test.skip(
      process.env.PRITHA_E2E_ISOLATED_STATE !== "1" || !isolatedStateRoot || !isolatedPort || isolatedPort === "3420",
      "NeuralDeep billing UI test requires an explicit isolated state root and a non-live port.",
    );
    const privateRoot = realtimePrivateRoot();
    const runtimePath = path.join(privateRoot, "runtime-settings.json");
    const eventsPath = path.join(privateRoot, "events.jsonl");
    const originalRuntime = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
    const originalEvents = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : null;

    try {
      restoreFile(runtimePath, null);
      const catalogResponse = await page.request.get("/api/settings/codex-models");
      expect(catalogResponse.ok()).toBeTruthy();
      const catalog = await catalogResponse.json() as {
        models: Array<{ id: string; isDefault: boolean; currentAccess: string }>;
      };
      const initialModel = catalog.models.find((model) => model.isDefault)?.id;
      const pricedModel = catalog.models.find((model) => model.id !== initialModel && model.currentAccess !== "included");
      expect(initialModel).toBeTruthy();
      test.skip(!pricedModel, "Current NeuralDeep catalog has no advisory-priced model to exercise.");

      const beforeId = `e2e-billing-before-${Date.now()}`;
      const beforeResponse = await page.request.post("/api/codex-chat/v1/threads", {
        headers: { "Idempotency-Key": beforeId },
        data: { clientThreadId: beforeId, source: "chat", title: "Before billing model change" },
      });
      expect(beforeResponse.status()).toBe(201);
      const before = await beforeResponse.json();
      expect(before.data.thread.runtime.model).toBe(initialModel);

      await page.goto("/settings");
      await page.getByRole("tab", { name: "Usage & Billing" }).click();
      await expect(page.getByRole("heading", { name: "Usage & Billing" }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Expenses" }).filter({ visible: true }).first()).toHaveAttribute("href", "https://neuraldeep.ru/app/spend");
      await expect(page.getByRole("link", { name: "Plan & payment" }).filter({ visible: true }).first()).toHaveAttribute("href", "https://neuraldeep.ru/app/billing");

      const modelSelect = page.locator('select[aria-label="Codex model"]:visible');
      await expect(modelSelect).toHaveValue(initialModel as string);
      await expect(modelSelect.locator("option")).toHaveCount(catalog.models.length);
      expect(await modelSelect.locator("option").evaluateAll((options) => options.every((option) => !(option as HTMLOptionElement).disabled))).toBeTruthy();
      await modelSelect.selectOption(pricedModel!.id);
      await page.locator('button:visible', { hasText: "Save Codex Runtime" }).click();
      await expect(page.getByText("Confirm model access and possible charges").filter({ visible: true }).first()).toBeVisible();
      const continueButton = page.getByRole("button", { name: "Continue and save" });
      await expect(continueButton).toBeEnabled();
      await continueButton.click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();

      const beforeDetail = await (await page.request.get(`/api/codex-chat/v1/threads/${encodeURIComponent(before.data.thread.chatId)}`)).json();
      expect(beforeDetail.data.thread.runtime.model).toBe(initialModel);
      const afterId = `e2e-billing-after-${Date.now()}`;
      const afterResponse = await page.request.post("/api/codex-chat/v1/threads", {
        headers: { "Idempotency-Key": afterId },
        data: { clientThreadId: afterId, source: "chat", title: "After billing model change" },
      });
      expect(afterResponse.status()).toBe(201);
      const after = await afterResponse.json();
      expect(after.data.thread.runtime.model).toBe(pricedModel!.id);
      await expectNoPageOverflow(page);
    } finally {
      restoreFile(runtimePath, originalRuntime);
      restoreFile(eventsPath, originalEvents);
    }
  });

  test("selects, saves, and reloads catalog-backed Codex model capabilities without overflow", async ({ page }) => {
    const isolatedStateRoot = process.env.PRITHA_STATE_ROOT?.trim();
    const isolatedPort = process.env.PRITHA_CONTROL_CENTER_PORT?.trim();
    test.skip(
      process.env.PRITHA_E2E_ISOLATED_STATE !== "1" || !isolatedStateRoot || !isolatedPort || isolatedPort === "3420",
      "Codex settings persistence test requires an explicit isolated state root and a non-live port.",
    );
    const privateRoot = realtimePrivateRoot();
    const runtimePath = path.join(privateRoot, "runtime-settings.json");
    const eventsPath = path.join(privateRoot, "events.jsonl");
    const originalRuntime = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
    const originalEvents = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : null;

    try {
      const beforeResponse = await page.request.get("/api/realtime/runtime-settings");
      expect(beforeResponse.ok()).toBeTruthy();
      const before = await beforeResponse.json();
      const catalogResponse = await page.request.get("/api/settings/codex-models");
      expect(catalogResponse.ok()).toBeTruthy();
      const catalog = await catalogResponse.json() as {
        models: Array<{
          id: string;
          capabilities: { reasoning: boolean };
          supportedReasoningEfforts: Array<{ id: string }>;
          serviceTiers: Array<{ id: string }>;
        }>;
      };
      const capableModel = catalog.models.find((model) => model.capabilities.reasoning && model.supportedReasoningEfforts.some((effort) => effort.id === "xhigh"));
      test.skip(!capableModel, "Current NeuralDeep catalog has no confirmed xhigh reasoning model.");
      const legacyUltraSettings = {
        ...before.settings,
        codexModel: "gpt-5.6-sol",
        codexReasoningEffort: "ultra",
        codexServiceTier: "fast",
        codexExecutionMode: "orchestrator_preferred",
        updatedAt: new Date().toISOString(),
      };
      mkdirSync(privateRoot, { recursive: true });
      writeFileSync(runtimePath, `${JSON.stringify(legacyUltraSettings, null, 2)}\n`);
      const normalizedLegacy = await (await page.request.get("/api/realtime/runtime-settings")).json();
      expect(normalizedLegacy.settings.codexReasoningEffort).toBe("ultra");
      expect(normalizedLegacy.settings.codexExecutionMode).toBe("inline_only");

      const customSettings = {
        ...before.settings,
        codexModel: "private-custom-model",
        codexReasoningEffort: "custom_effort",
        codexServiceTier: "fast",
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(runtimePath, `${JSON.stringify(customSettings, null, 2)}\n`);

      await page.goto("/settings");
      const customModel = page.locator('select[aria-label="Codex model"]:visible');
      const customEffort = page.locator('select[aria-label="Codex reasoning level"]:visible');
      await expect(customModel).toHaveValue("private-custom-model");
      await expect(customModel.locator('option[value="private-custom-model"]')).toContainText("Unavailable/custom");
      await expect(customEffort).toHaveValue("custom_effort");
      await expect(customEffort.locator('option[value="custom_effort"]')).toContainText("Unavailable/custom");
      await expect(page.locator('.settings-segmented-control:visible button', { hasText: "Fast" })).toHaveCount(0);
      await page.locator('button:visible', { hasText: "Save Codex Runtime" }).click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.locator('select[aria-label="Codex model"]:visible')).toHaveValue("private-custom-model");

      const rejected = await page.request.post("/api/realtime/runtime-settings", {
        data: { codexModel: capableModel!.id, codexReasoningEffort: "ultra", codexServiceTier: "standard", neuraldeepBillingAcknowledged: true },
      });
      expect(rejected.status()).toBe(400);
      expect((await rejected.json()).error).toBe("unsupported_codex_reasoning_effort");
      const afterRejected = await (await page.request.get("/api/realtime/runtime-settings")).json();
      expect(afterRejected.settings.codexModel).toBe(customSettings.codexModel);
      expect(afterRejected.settings.codexReasoningEffort).toBe(customSettings.codexReasoningEffort);

      const legacy = await page.request.post("/api/realtime/runtime-settings", {
        data: { codexModel: capableModel!.id, codexReasoningEffort: "very_high", codexServiceTier: "standard", neuraldeepBillingAcknowledged: true },
      });
      expect(legacy.ok()).toBeTruthy();
      const legacyPayload = await legacy.json();
      expect(legacyPayload.settings.codexReasoningEffort).toBe("xhigh");

      writeFileSync(runtimePath, `${JSON.stringify({ ...legacyUltraSettings, codexExecutionMode: "inline_only" }, null, 2)}\n`);
      const nestedOrchestration = await page.request.post("/api/realtime/runtime-settings", {
        data: { codexExecutionMode: "orchestrator_preferred" },
      });
      expect(nestedOrchestration.status()).toBe(400);
      expect((await nestedOrchestration.json()).error).toBe("ultra_requires_inline_execution");
      writeFileSync(runtimePath, `${JSON.stringify(legacyPayload.settings, null, 2)}\n`);

      await page.goto("/settings");
      const model = page.locator('select[aria-label="Codex model"]:visible');
      const effort = page.locator('select[aria-label="Codex reasoning level"]:visible');
      const executionMode = page.locator('select[aria-label="Codex execution mode"]:visible');
      await expect(model).toBeVisible();
      await expect(model).toHaveValue(capableModel!.id);
      await expect(model.locator(`option[value="${capableModel!.id}"]`)).toHaveCount(1);
      for (const option of capableModel!.supportedReasoningEfforts) {
        await expect(effort.locator(`option[value="${option.id}"]`)).toHaveCount(1);
      }
      await expect(effort.locator('option[value="ultra"]')).toHaveCount(0);

      await executionMode.selectOption("orchestrator_preferred");
      await effort.selectOption("xhigh");
      await expect(executionMode).toHaveValue("orchestrator_preferred");
      await expect(executionMode).toBeEnabled();
      if (!capableModel!.serviceTiers.some((tier) => tier.id === "priority")) {
        await expect(page.locator('.settings-segmented-control:visible button', { hasText: "Fast" })).toHaveCount(0);
      }
      await page.locator('button:visible', { hasText: "Save Codex Runtime" }).click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();

      await page.reload();
      await expect(page.locator('select[aria-label="Codex model"]:visible')).toHaveValue(capableModel!.id);
      await expect(page.locator('select[aria-label="Codex reasoning level"]:visible')).toHaveValue("xhigh");
      await expect(page.locator('select[aria-label="Codex execution mode"]:visible')).toHaveValue("orchestrator_preferred");
      await expectNoPageOverflow(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.locator('select[aria-label="Codex model"]:visible')).toHaveValue(capableModel!.id);
      await expect(page.locator('select[aria-label="Codex reasoning level"]:visible')).toHaveValue("xhigh");
      const billingSummary = page.locator(".codex-model-billing-summary:visible");
      await billingSummary.scrollIntoViewIfNeeded();
      const billingCopyBox = await billingSummary.locator(":scope > div").first().boundingBox();
      const billingMetricsBox = await billingSummary.locator(".settings-mini-metrics").boundingBox();
      expect(billingCopyBox).not.toBeNull();
      expect(billingMetricsBox).not.toBeNull();
      expect(billingCopyBox!.y + billingCopyBox!.height).toBeLessThanOrEqual(billingMetricsBox!.y + 1);

      const sandbox = page.locator('select[aria-label="Codex sandbox policy"]:visible');
      const nextSandbox = await sandbox.inputValue() === "read-only" ? "workspace-write" : "read-only";
      await sandbox.selectOption(nextSandbox);
      await expect(page.getByText("Unsaved changes — apply them before starting a new task.").filter({ visible: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Apply Codex settings" }).filter({ visible: true }).click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.locator('select[aria-label="Codex sandbox policy"]:visible')).toHaveValue(nextSandbox);
      const networkSwitch = page.locator('[aria-label="Codex network access"]:visible');
      const network = networkSwitch.locator("input");
      if (await network.isChecked()) await networkSwitch.click();
      await expect(network).not.toBeChecked();
      await sandbox.selectOption("danger-full-access");
      await expect(network).toBeChecked();
      await expect(network).toBeDisabled();
      await page.getByRole("button", { name: "Apply Codex settings" }).filter({ visible: true }).click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();
      await page.reload();
      await expect(sandbox).toHaveValue("danger-full-access");
      await expect(network).toBeChecked();
      await expect(network).toBeDisabled();
      await expectNoPageOverflow(page);
    } finally {
      restoreFile(runtimePath, originalRuntime);
      restoreFile(eventsPath, originalEvents);
    }
  });

  test("guards voice context reset behind an explicit confirmation", async ({ page }) => {
    await page.goto("/voice");

    await expect(page.locator('input[aria-label="Voice input level"]:visible').first()).toBeVisible();
    await expect(page.getByText("Voice input level").filter({ visible: true }).first()).toBeVisible();
    const resetButton = page.locator('button:visible').filter({ hasText: "Reset Voice Context" }).first();
    await expect(resetButton).toBeVisible();
    await expect(resetButton).toBeEnabled();
    await resetButton.click();

    await expect(page.getByText("Reset current voice context for this session?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Reset current voice context for this session?")).toHaveCount(0);
  });

  test("reports terminal Codex timeout with a voice-safe operator brief", async ({ page }) => {
    const { taskId, taskDir } = writeFakeCodexTask("failed_timeout");
    try {
      const response = await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(taskId)}`);
      expect(response.ok()).toBeTruthy();
      const detail = await response.json();
      expect(detail.ok).toBe(true);
      expect(detail.status).toBe("failed_timeout");
      expect(detail.complete).toBe(true);
      expect(detail.operator_brief).toContain("timed out");
      expect(detail.voice_handoff_required).toBe(true);
      expect(detail.progress_timeline.length).toBeGreaterThan(0);

      const briefResponse = await page.request.post("/api/realtime/tool", {
        data: {
          name: "inspect_codex_task",
          arguments: { operation: "brief", task_id: taskId },
        },
      });
      expect(briefResponse.ok()).toBeTruthy();
      const brief = await briefResponse.json();
      expect(brief.ok).toBe(true);
      expect(brief.status).toBe("failed_timeout");
      expect(brief.operator_brief).toContain("timed out");

      const diagnoseResponse = await page.request.post("/api/realtime/tool", {
        data: {
          name: "inspect_codex_task",
          arguments: { operation: "diagnose", task_id: taskId },
        },
      });
      expect(diagnoseResponse.ok()).toBeTruthy();
      const diagnosis = await diagnoseResponse.json();
      expect(diagnosis.ok).toBe(true);
      expect(diagnosis.diagnosis).toBe("timeout");

      await page.goto("/voice");
      await expect(page.getByText("failed_timeout").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/timed out/i).filter({ visible: true }).first()).toBeVisible();
    } finally {
      rmSync(taskDir, { recursive: true, force: true });
    }
  });

  test("preserves an unowned stale legacy task instead of inferring exit from its PID or elapsed time", async ({ page }) => {
    const { taskId, taskDir } = writeStaleCodexTask();
    const originalStatus=readFileSync(path.join(taskDir,"status.json"),"utf8");
    try {
      const response = await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(taskId)}`);
      expect(response.ok()).toBeTruthy();
      const detail = await response.json();
      expect(detail.ok).toBe(true);
      expect(detail.status).toBe("running");expect(detail.complete).toBe(false);
      expect(detail.latest_voice_feedback?.phase).not.toBe("stale_repaired");
      const abort=await page.request.post(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/abort`,{headers:{Origin:new URL(response.url()).origin},data:{reason:"Synthetic ownership guard check",expected_attempt_id:"unproven_fixture"}});
      expect((await abort.json()).error).toBe("legacy_runtime_identity_unverified");
      expect(readFileSync(path.join(taskDir,"status.json"),"utf8")).toBe(originalStatus);
      expect(readFileSync(path.join(taskDir,"result.md"),"utf8")).toBe("");
    } finally {
      rmSync(taskDir, { recursive: true, force: true });
    }
  });

  test("keeps mobile primary tabs within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ["/agents", "/voice", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator(".mobile-shell")).toBeVisible();
      await expect(page.locator("h1:visible").first()).toBeVisible();
      await expectNoPageOverflow(page);
      await expectNoRawSecret(page);
    }
  });
});
