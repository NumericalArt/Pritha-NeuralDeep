import fs from "node:fs"
import path from "node:path"

import { NextResponse } from "next/server"

import { createCodexTaskService } from "@/lib/codex-task/factory"
import type { CodexTaskType } from "@/lib/codex-task/types"
import { triggerFespaJobRunner } from "@/lib/fespa/job-runner-autostart"
import { fespaRepo } from "@/lib/repositories/fespa-repo"
import { runtimeRepo } from "@/lib/repositories/runtime-repo"
import { sessionsRepo } from "@/lib/repositories/sessions-repo"

type ToolPayload = {
  name?: string
  arguments?: Record<string, unknown>
}

type ToolResult = {
  ok: boolean
  tool: string
  message: string
  spoken?: string
  data?: unknown
  error?: string
}

type DeepTaskPrimaryTransport = "codex-app" | "codex-cli"

const codexTaskService = createCodexTaskService()

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === "string" ? value.trim() : ""
}

function numberArg(args: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(args[key])
  return Number.isFinite(value) ? value : fallback
}

function boolArg(args: Record<string, unknown>, key: string, fallback: boolean) {
  const value = args[key]
  return typeof value === "boolean" ? value : fallback
}

function stringArrayArg(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
}

function enumArg<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
) {
  const value = args[key]
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback
}

function isSystemChangeTask(value: string) {
  const normalized = value.toLowerCase()
  return [
    "ui",
    "interface",
    "button",
    "tab",
    "settings",
    "language switch",
    "app behavior",
    "agent behavior",
    "job runner",
    "codex behavior",
    "код",
    "интерфейс",
    "кноп",
    "вклад",
    "переключ",
    "поведение",
    "маршрутизац",
    "роутинг",
    "памят",
    "очеред",
    "агент",
    "кодекс",
    "систем",
    "удали",
    "удалить",
    "исправ",
    "доработ",
  ].some((marker) => normalized.includes(marker))
}

function toolOk(tool: string, message: string, data?: unknown, spoken = message): ToolResult {
  return { ok: true, tool, message, spoken, data }
}

function toolError(tool: string, message: string): ToolResult {
  return { ok: false, tool, message, spoken: message, error: message }
}

function codexCliFallbackEnabled() {
  return (
    process.env.FESPA_ENABLE_CODEX_CLI_TOOL === "true" ||
    process.env.FESPA_ENABLE_CODEX_CLI_FALLBACK === "true"
  )
}

function activeDeepTaskPrimaryTransport(): DeepTaskPrimaryTransport {
  const activeSession = sessionsRepo.getActive()
  if (!activeSession) {
    return "codex-app"
  }
  return runtimeRepo.getBySession(activeSession.id)?.deepTaskPrimaryTransport || "codex-app"
}

function maybeTriggerQueued(reason: string, force = false) {
  if (!force && !codexCliFallbackEnabled()) {
    return {
      started: false,
      reason,
      message: "Codex CLI fallback is disabled.",
    }
  }
  return triggerQueued(reason)
}

function triggerCliTransport(reason: string) {
  return maybeTriggerQueued(reason, true)
}

function genericExpectedSchema() {
  return {
    status: "ok|error",
    text: "operator-facing result or summary",
    data: "structured task-specific data",
    errors: ["error text"],
    warnings: ["warning text"],
  }
}

async function runCodexAppTask(input: {
  tool: string
  taskType: CodexTaskType
  task: string
  ids?: Record<string, string | string[] | number | number[] | null>
  data?: Record<string, unknown>
  constraints?: string[]
}) {
  return codexTaskService.runTask({
    taskType: input.taskType,
    userIntent: input.task,
    ids: input.ids,
    data: {
      tool: input.tool,
      ...input.data,
    },
    constraints: input.constraints,
    expectedSchema: genericExpectedSchema(),
  })
}

function codexAppToolOk(tool: string, data: unknown, spoken?: string) {
  return toolOk(
    tool,
    "Codex App task completed.",
    data,
    spoken || "Codex App выполнил задачу и вернул результат.",
  )
}

function codexTaskShouldReturnDirectly(result: { status: string }) {
  return result.status === "ok" || result.status === "decision_required"
}

function codexTaskSpoken(result: {
  status: string
  text?: string
  data?: Record<string, unknown>
}) {
  if (result.status === "ok" && result.text) {
    return result.text
  }
  if (result.status !== "decision_required") {
    return result.text || undefined
  }
  const requestPath = String(result.data?.requestPath || "")
  const promptPath = String(result.data?.promptPath || "")
  const decisionPath = String(result.data?.decisionPath || "")
  if (!decisionPath) {
    return "Нужна сборка решения в текущем Codex App thread."
  }
  const requestPart = requestPath ? ` Запрос: ${requestPath}` : ""
  const promptPart = promptPath ? ` Prompt: ${promptPath}` : ""
  return `Нужна сборка решения в текущем Codex App thread.${requestPart}${promptPart} Файл решения: ${decisionPath}`
}

function codexAppFallbackData(codexAppResult: unknown, fallback: unknown, autoRunner: unknown) {
  return {
    codexAppResult,
    fallback,
    autoRunner,
  }
}

function sourceMediaKind(source: { sourceType?: string; mediaPath?: string | null }) {
  const mediaPath = source.mediaPath || ""
  if (/\.pdf$/i.test(mediaPath)) return "pdf"
  if (/\.(png|jpe?g|gif|webp|avif|heic)$/i.test(mediaPath)) return "image"
  if (/\.(mp4|mov|m4v|webm)$/i.test(mediaPath)) return "video"
  if (/\.(mp3|m4a|wav|aac|ogg)$/i.test(mediaPath)) return "audio"
  return source.sourceType || "file"
}

function mediaSourceContext(mediaKind = "latest", limit = 8) {
  return fespaRepo
    .listSources(40)
    .filter((source) => source.mediaPath)
    .filter((source) => {
      if (!mediaKind || mediaKind === "latest") return true
      return sourceMediaKind(source) === mediaKind
    })
    .slice(0, limit)
    .map((source) => ({
      id: source.id,
      title: source.title,
      sourceType: source.sourceType,
      mediaKind: sourceMediaKind(source),
      mediaPath: source.mediaPath,
      company: source.company,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }))
}

async function queueSystemTask(task: string, trigger: string) {
  if (activeDeepTaskPrimaryTransport() === "codex-cli") {
    const result = fespaRepo.queueSystemTask({ task, language: "ru" })
    const autoRunner = triggerCliTransport(trigger)
    return toolOk(
      "queue_codex_system_task",
      "Codex CLI task queued as primary transport.",
      { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
      "Поставил системную задачу в Codex CLI. Codex App остается fallback.",
    )
  }

  const codexAppResult = await runCodexAppTask({
    tool: "queue_codex_system_task",
    taskType: "system_change",
    task,
    constraints: [
      "This is a FESPA26 app/system implementation request.",
      "Make real code/config/documentation changes only inside the project workspace.",
      "Return changed files and verification commands.",
    ],
  })
  if (codexTaskShouldReturnDirectly(codexAppResult)) {
    return codexAppToolOk(
      "queue_codex_system_task",
      { codexAppResult },
      codexTaskSpoken(codexAppResult),
    )
  }

  const result = fespaRepo.queueSystemTask({ task, language: "ru" })
  const autoRunner = triggerCliTransport(trigger)
  return toolOk(
    "queue_codex_system_task",
    "Codex App is unavailable. System change captured in the local Codex fallback queue.",
    codexAppFallbackData(codexAppResult, result, autoRunner),
    "Codex App недоступен. Поставил системную задачу в резервную очередь Codex CLI.",
  )
}

function triggerQueued(reason: string) {
  return triggerFespaJobRunner(reason)
}

function runnerLockStatus() {
  const lockDir = path.join(process.cwd(), "data", "locks", "fespa-jobs-run.lock")
  const locked = fs.existsSync(lockDir)
  const metaPath = path.join(lockDir, "meta.json")
  let meta: unknown = null
  if (locked && fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"))
    } catch {
      meta = null
    }
  }
  return { locked, lockDir, meta }
}

async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (name === "save_fespa_source") {
    const text = stringArg(args, "text")
    if (!text) {
      return toolError(name, "text is required")
    }
    if (isSystemChangeTask(`${stringArg(args, "title")} ${text}`)) {
      return await queueSystemTask(text, "realtime-system-task")
    }
    const result = fespaRepo.ingest({
      sourceType: stringArg(args, "url") ? "link" : "text",
      title: stringArg(args, "title"),
      text,
      url: stringArg(args, "url"),
      language: stringArg(args, "language") === "en" ? "en" : "ru",
    })
    const autoRunner = triggerQueued("realtime-save-source")
    return toolOk(
      name,
      "Source saved to FESPA26 memory and draft feed.",
      { result, autoRunner },
      "Сохранил источник в память FESPA26 и поставил Codex-обработку в очередь.",
    )
  }

  if (name === "get_fespa_feed_context") {
    const limit = numberArg(args, "limit", 5)
    return toolOk(name, "FESPA26 feed context loaded.", {
      counts: fespaRepo.getCounts(),
      latestFeedItems: fespaRepo.listFeed(Number.isFinite(limit) ? limit : 5),
    })
  }

  if (name === "queue_codex_feed_task") {
    const task = stringArg(args, "task")
    if (!task) {
      return toolError(name, "task is required")
    }
    if (isSystemChangeTask(task)) {
      return await queueSystemTask(task, "realtime-system-task")
    }
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueGenericCodexTask({
        jobType: "codex_refine",
        title: "Codex feed task",
        task: `Codex sidecar task queued by realtime dialogue: ${task}`,
        language: "ru",
        result: {
          requestedFrom: "realtime",
          task,
          taskOnly: true,
        },
      })
      const autoRunner = triggerCliTransport("realtime-codex-task")
      return toolOk(
        name,
        "Codex CLI feed task queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        "Поставил задачу для ленты в Codex CLI. Codex App остается fallback.",
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType: "feed_refine",
      task,
      data: {
        latestFeedItems: fespaRepo.listFeed(5).map((item) => ({
          id: item.id,
          stableNo: item.stableNo,
          titleRu: item.titleRu,
          titleEn: item.titleEn,
          status: item.status,
        })),
      },
      constraints: ["Do not publish. Return feed-ready text or next actions."],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueGenericCodexTask({
      jobType: "codex_refine",
      title: "Codex feed task",
      task: `Codex sidecar task queued by realtime dialogue: ${task}`,
      language: "ru",
      result: {
        requestedFrom: "realtime",
        task,
        taskOnly: true,
      },
    })
    const autoRunner = triggerCliTransport("realtime-codex-task")
    return toolOk(
      name,
      "Codex App is unavailable. Feed task captured in the local Codex fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      "Codex App недоступен. Поставил задачу для ленты в резервную очередь Codex CLI.",
    )
  }

  if (name === "queue_codex_card_update") {
    const task = stringArg(args, "task")
    if (!task) {
      return toolError(name, "task is required")
    }
    const cardRefs = stringArrayArg(args, "card_refs")
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueCardUpdateTask({
        task,
        refs: cardRefs,
        autoApply: boolArg(args, "auto_apply", true),
        language: "ru",
      })
      if (!result.ok) {
        return toolError(
          name,
          result.message ||
            "Не смог найти карточки-цели. Назови стабильный номер карточки или точный заголовок.",
        )
      }
      const targetLabel = (result.targets ?? [])
        .map((item) => `#${item.stableNo ?? item.id}`)
        .join(", ")
      const autoRunner = triggerCliTransport("realtime-card-update-task")
      return toolOk(
        name,
        "Codex CLI card update queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        `Поставил обновление карточек в Codex CLI. Цели: ${targetLabel}. Codex App остается fallback.`,
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType: "card_update",
      task,
      ids: { cardRefs },
      data: {
        autoApply: boolArg(args, "auto_apply", true),
        latestFeedItems: fespaRepo.listFeed(10).map((item) => ({
          id: item.id,
          stableNo: item.stableNo,
          titleRu: item.titleRu,
          titleEn: item.titleEn,
          status: item.status,
          publicationStatus: item.publicationStatus,
        })),
      },
      constraints: [
        "Update existing feed cards only.",
        "Do not create a new publication card.",
        "Do not publish.",
        "Return patches keyed by stable card number or feed item id.",
      ],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueCardUpdateTask({
      task,
      refs: cardRefs,
      autoApply: boolArg(args, "auto_apply", true),
      language: "ru",
    })
    if (!result.ok) {
      return toolError(
        name,
        result.message ||
          "Не смог найти карточки-цели. Назови стабильный номер карточки или точный заголовок.",
      )
    }
    const targetLabel = (result.targets ?? [])
      .map((item) => `#${item.stableNo ?? item.id}`)
      .join(", ")
    const autoRunner = triggerCliTransport("realtime-card-update-task")
    return toolOk(
      name,
      "Codex App is unavailable. Existing feed card update captured in the local fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      `Codex App недоступен. Поставил обновление карточек в резервную очередь Codex CLI. Цели: ${targetLabel}.`,
    )
  }

  if (name === "queue_codex_system_task") {
    const task = stringArg(args, "task")
    if (!task) {
      return toolError(name, "task is required")
    }
    return await queueSystemTask(task, "realtime-system-task")
  }

  if (name === "queue_codex_cli_task") {
    const task = stringArg(args, "task")
    if (!task) {
      return toolError(name, "task is required")
    }
    if (!codexCliFallbackEnabled()) {
      return toolError(
        name,
        "Codex CLI tool is disabled. Set FESPA_ENABLE_CODEX_CLI_TOOL=true to enable it.",
      )
    }
    const mode = enumArg(args, "mode", ["analysis", "feed", "system"] as const, "analysis")
    const result = fespaRepo.queueExplicitCodexTask({
      task,
      mode,
      priority: enumArg(args, "priority", ["normal", "high"] as const, "normal"),
      speakResult: boolArg(args, "speak_result", true),
    })
    const autoRunner = triggerQueued("realtime-explicit-codex-task")
    return toolOk(
      name,
      "Explicit Codex CLI task queued.",
      { result, autoRunner },
      `Поставил задачу в очередь Codex. Job id: ${result.job?.id ?? "unknown"}.`,
    )
  }

  if (name === "run_codex_app_task") {
    const task = stringArg(args, "task")
    if (!task) {
      return toolError(name, "task is required")
    }
    const taskType = enumArg(
      args,
      "task_type",
      [
        "feed_refine",
        "card_update",
        "system_change",
        "explicit",
        "source_search",
        "media_analysis",
        "translation_pass",
        "followup_checklist",
      ] as const,
      "explicit",
    )
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueExplicitCodexTask({
        task,
        mode: taskType === "system_change" ? "system" : "analysis",
        priority: enumArg(args, "priority", ["normal", "high"] as const, "normal"),
        speakResult: boolArg(args, "speak_result", true),
      })
      const autoRunner = triggerCliTransport("realtime-codex-cli-primary")
      return toolOk(
        name,
        "Codex CLI task queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        `Поставил задачу в Codex CLI. Job id: ${result.job?.id ?? "unknown"}. Codex App остается fallback.`,
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType,
      task,
      data: {
        relevantMediaSources:
          taskType === "media_analysis" || taskType === "source_search"
            ? mediaSourceContext("latest", 8)
            : undefined,
        latestFeedItems: fespaRepo.listFeed(5).map((item) => ({
          id: item.id,
          stableNo: item.stableNo,
          titleRu: item.titleRu,
          titleEn: item.titleEn,
          status: item.status,
        })),
      },
      constraints: ["Return a concise operator-facing result and structured data if useful."],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueExplicitCodexTask({
      task,
      mode: taskType === "system_change" ? "system" : "analysis",
      priority: enumArg(args, "priority", ["normal", "high"] as const, "normal"),
      speakResult: boolArg(args, "speak_result", true),
    })
    const autoRunner = triggerCliTransport("realtime-codex-app-fallback")
    return toolOk(
      name,
      "Codex App is unavailable. Task captured in the local fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      `Codex App недоступен. Поставил задачу в резервную очередь Codex CLI. Job id: ${result.job?.id ?? "unknown"}.`,
    )
  }

  if (name === "search_sources") {
    const query = stringArg(args, "query")
    if (!query) {
      return toolError(name, "query is required")
    }
    const sourceScope = enumArg(args, "source_scope", ["official", "web"] as const, "official")
    const companies = stringArrayArg(args, "companies")
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueSearchSources({
        query,
        sourceScope,
        companies,
        maxResults: numberArg(args, "max_results", 5),
        speakResult: boolArg(args, "speak_result", true),
      })
      const autoRunner = triggerCliTransport("realtime-source-search")
      return toolOk(
        name,
        "Codex CLI source search queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        `Поставил поиск источников в Codex CLI. Job id: ${result.job?.id ?? "unknown"}. Codex App остается fallback.`,
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType: "source_search",
      task: query,
      data: {
        sourceScope,
        companies,
        maxResults: numberArg(args, "max_results", 5),
      },
      constraints: [
        "Prefer official or exhibitor sources for verification.",
        "Return source links and claim statuses.",
      ],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueSearchSources({
      query,
      sourceScope,
      companies,
      maxResults: numberArg(args, "max_results", 5),
      speakResult: boolArg(args, "speak_result", true),
    })
    const autoRunner = triggerCliTransport("realtime-source-search")
    return toolOk(
      name,
      "Codex App is unavailable. Source search captured in the local fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      `Codex App недоступен. Поставил поиск источников в резервную очередь Codex CLI. Job id: ${result.job?.id ?? "unknown"}.`,
    )
  }

  if (name === "analyze_uploaded_media") {
    const sourceId = stringArg(args, "source_id")
    const mediaKind = stringArg(args, "media_kind") || "latest"
    const task = stringArg(args, "task") || "Analyze uploaded media."
    const source = fespaRepo.getLatestSourceWithMedia({
      sourceId: sourceId || undefined,
      mediaKind,
    })
    if (!source) {
      return toolError(name, "No uploaded media source found")
    }
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueMediaAnalysis({
        sourceId: source.id,
        task: stringArg(args, "task") || undefined,
        mediaKind,
        speakResult: boolArg(args, "speak_result", true),
      })
      if (!result) {
        return toolError(name, "No uploaded media source found")
      }
      const autoRunner = triggerCliTransport("realtime-media-analysis")
      return toolOk(
        name,
        "Codex CLI media analysis queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        `Поставил анализ медиа в Codex CLI. Job id: ${result.job?.id ?? "unknown"}. Codex App остается fallback.`,
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType: "media_analysis",
      task,
      ids: { sourceId: source.id },
      data: {
        mediaKind,
        target: {
          sourceId: source.id,
          title: source.title,
          sourceType: source.sourceType,
          mediaKind: sourceMediaKind(source),
          mediaPath: source.mediaPath,
          localPath: source.mediaPath
            ? path.join(process.cwd(), "data", "uploads", source.mediaPath)
            : null,
          company: source.company,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        },
        relevantMediaSources: mediaSourceContext(mediaKind, 8),
      },
      constraints: [
        "Use the target source id and media path from this payload.",
        "Do not send raw private files through the task payload.",
        "If media inspection requires local file access, use the provided localPath inside this machine only.",
      ],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueMediaAnalysis({
      sourceId: source.id,
      task: stringArg(args, "task") || undefined,
      mediaKind,
      speakResult: boolArg(args, "speak_result", true),
    })
    if (!result) {
      return toolError(name, "No uploaded media source found")
    }
    const autoRunner = triggerCliTransport("realtime-media-analysis")
    return toolOk(
      name,
      "Codex App is unavailable. Uploaded media analysis captured in the local fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      `Codex App недоступен. Поставил анализ медиа в резервную очередь Codex CLI. Job id: ${result.job?.id ?? "unknown"}.`,
    )
  }

  if (name === "get_source_details") {
    const targetType = enumArg(
      args,
      "target_type",
      ["source", "feed_item", "job"] as const,
      "source",
    )
    const targetId = stringArg(args, "id")
    const latest = boolArg(args, "latest", !targetId)
    if (targetType === "source") {
      const data = latest ? fespaRepo.listSources(1)[0] : fespaRepo.getSourceById(targetId)
      return data
        ? toolOk(name, "Source details loaded.", { targetType, data })
        : toolError(name, "Source not found")
    }
    if (targetType === "feed_item") {
      const data = latest ? fespaRepo.listFeed(1)[0] : fespaRepo.getFeedItemById(targetId)
      return data
        ? toolOk(name, "Feed item details loaded.", { targetType, data })
        : toolError(name, "Feed item not found")
    }
    const data = latest ? fespaRepo.listJobs(1)[0] : fespaRepo.getJobById(targetId)
    return data
      ? toolOk(name, "Job details loaded.", { targetType, data })
      : toolError(name, "Job not found")
  }

  if (name === "update_feed_draft") {
    const feedItemId = stringArg(args, "feed_item_id")
    if (!feedItemId) {
      return toolError(name, "feed_item_id is required")
    }
    const result = fespaRepo.updateFeedDraft({
      feedItemId,
      titleRu: stringArg(args, "title_ru") || undefined,
      titleEn: stringArg(args, "title_en") || undefined,
      summaryRu: stringArg(args, "summary_ru") || undefined,
      summaryEn: stringArg(args, "summary_en") || undefined,
      bodyRu: stringArg(args, "body_ru") || undefined,
      bodyEn: stringArg(args, "body_en") || undefined,
      tags: stringArrayArg(args, "tags"),
      priority: numberArg(args, "priority", Number.NaN),
    })
    return result
      ? toolOk(
          name,
          "Feed draft updated without publishing.",
          { result },
          "Обновил черновик карточки без публикации.",
        )
      : toolError(name, "Feed item not found or not editable")
  }

  if (name === "publish_feed_item") {
    const feedItemId = stringArg(args, "feed_item_id")
    const confirmationText = stringArg(args, "confirmation_text")
    if (!feedItemId) {
      return toolError(name, "feed_item_id is required")
    }
    const result = fespaRepo.publishFeedItemWithConfirmation(feedItemId, confirmationText)
    if (!result.ok) {
      return toolError(name, result.message)
    }
    return toolOk(name, "Feed item published.", result, "Опубликовал карточку.")
  }

  if (name === "mark_claim_verified") {
    const feedItemId = stringArg(args, "feed_item_id")
    const claimText = stringArg(args, "claim_text")
    const verificationStatus = enumArg(
      args,
      "verification_status",
      ["verified", "partially_verified", "unverified"] as const,
      "unverified",
    )
    if (!feedItemId || !claimText) {
      return toolError(name, "feed_item_id and claim_text are required")
    }
    try {
      const result = fespaRepo.markClaimVerified({
        feedItemId,
        claimText,
        verificationStatus,
        sourceUrl: stringArg(args, "source_url") || undefined,
        note: stringArg(args, "note") || undefined,
      })
      return result
        ? toolOk(
            name,
            "Claim verification updated.",
            { result },
            "Обновил статус проверки утверждения.",
          )
        : toolError(name, "Feed item not found")
    } catch (error) {
      return toolError(name, error instanceof Error ? error.message : "Claim verification failed")
    }
  }

  if (name === "queue_translation_pass") {
    const feedItemId = stringArg(args, "feed_item_id")
    const sourceId = stringArg(args, "source_id")
    const direction = enumArg(args, "direction", ["ru_to_en", "en_to_ru", "sync"] as const, "sync")
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueTranslationPass({
        feedItemId: feedItemId || undefined,
        sourceId: sourceId || undefined,
        direction,
        speakResult: boolArg(args, "speak_result", true),
      })
      const autoRunner = triggerCliTransport("realtime-translation-pass")
      return toolOk(
        name,
        "Codex CLI translation pass queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        `Поставил синхронизацию RU/EN в Codex CLI. Job id: ${result.job?.id ?? "unknown"}. Codex App остается fallback.`,
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType: "translation_pass",
      task: `Synchronize RU/EN fields. Direction: ${direction}.`,
      ids: { feedItemId: feedItemId || null, sourceId: sourceId || null },
      constraints: [
        "Preserve factual meaning between Russian and English.",
        "Do not add unsupported claims.",
        "Do not publish.",
      ],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueTranslationPass({
      feedItemId: feedItemId || undefined,
      sourceId: sourceId || undefined,
      direction,
      speakResult: boolArg(args, "speak_result", true),
    })
    const autoRunner = triggerCliTransport("realtime-translation-pass")
    return toolOk(
      name,
      "Codex App is unavailable. Translation pass captured in the local fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      `Codex App недоступен. Поставил синхронизацию RU/EN в резервную очередь Codex CLI. Job id: ${result.job?.id ?? "unknown"}.`,
    )
  }

  if (name === "get_runner_status") {
    const limit = numberArg(args, "limit", 5)
    return toolOk(name, "Codex runner status loaded.", {
      counts: fespaRepo.getCounts(),
      lock: runnerLockStatus(),
      queued: fespaRepo.listJobsByStatus("queued", limit),
      running: fespaRepo.listJobsByStatus("running", limit),
      failed: fespaRepo.listJobsByStatus("failed", limit),
      latest: fespaRepo.listJobs(limit),
    })
  }

  if (name === "create_followup_checklist") {
    const note = stringArg(args, "note")
    if (!note) {
      return toolError(name, "note is required")
    }
    const sourceId = stringArg(args, "source_id")
    const feedItemId = stringArg(args, "feed_item_id")
    if (activeDeepTaskPrimaryTransport() === "codex-cli") {
      const result = fespaRepo.queueFollowupChecklist({
        note,
        sourceId: sourceId || undefined,
        feedItemId: feedItemId || undefined,
        speakResult: boolArg(args, "speak_result", true),
      })
      const autoRunner = triggerCliTransport("realtime-followup-checklist")
      return toolOk(
        name,
        "Codex CLI follow-up checklist queued as primary transport.",
        { result, autoRunner, primaryTransport: "codex-cli", fallbackTransport: "codex-app" },
        `Поставил follow-up checklist в Codex CLI. Job id: ${result.job?.id ?? "unknown"}. Codex App остается fallback.`,
      )
    }
    const codexAppResult = await runCodexAppTask({
      tool: name,
      taskType: "followup_checklist",
      task: note,
      ids: { sourceId: sourceId || null, feedItemId: feedItemId || null },
      constraints: ["Return concrete follow-up actions, source checks, and feed actions."],
    })
    if (codexTaskShouldReturnDirectly(codexAppResult)) {
      return codexAppToolOk(name, { codexAppResult }, codexTaskSpoken(codexAppResult))
    }
    const result = fespaRepo.queueFollowupChecklist({
      note,
      sourceId: sourceId || undefined,
      feedItemId: feedItemId || undefined,
      speakResult: boolArg(args, "speak_result", true),
    })
    const autoRunner = triggerCliTransport("realtime-followup-checklist")
    return toolOk(
      name,
      "Codex App is unavailable. Follow-up checklist captured in the local fallback queue.",
      codexAppFallbackData(codexAppResult, result, autoRunner),
      `Codex App недоступен. Поставил follow-up checklist в резервную очередь Codex CLI. Job id: ${result.job?.id ?? "unknown"}.`,
    )
  }

  return toolError(name, `Unknown tool: ${name}`)
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ToolPayload
  const name = payload.name || ""
  const args = payload.arguments || {}

  const result = await handleTool(name, args)
  try {
    fespaRepo.auditToolEvent({
      toolName: name || "unknown",
      arguments: args,
      result: result as Record<string, unknown>,
      status: result.ok ? "ok" : "error",
    })
  } catch {
    // Tool execution must not fail because audit logging is unavailable.
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
