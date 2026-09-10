import { describe, expect, it } from "vitest"
import { buildRealtimeSessionPayload } from "../../lib/openai/realtime-config"
import { buildRealtimeTools } from "../../lib/openai/realtime-tools"

describe("realtime session payload", () => {
  it("embeds the base realtime assistant instructions", () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key"
    process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3001"
    process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "http://localhost:3001"

    const payload = buildRealtimeSessionPayload({
      mode: "cheap",
      locale: "ru-RU",
    })

    expect(payload.session.instructions.includes("FESPA26")).toBe(true)
    expect(payload.session.tools?.some((tool) => tool.name === "save_fespa_source")).toBe(true)
    expect(payload.session.tools?.some((tool) => tool.name === "queue_codex_system_task")).toBe(
      true,
    )
    expect(payload.session.tools?.some((tool) => tool.name === "run_codex_app_task")).toBe(true)
    expect(payload.session.tools?.some((tool) => tool.name === "queue_codex_cli_task")).toBe(false)
    expect(payload.session.tools?.some((tool) => tool.name === "get_runner_status")).toBe(true)
    expect(payload.session.tools?.some((tool) => tool.name === "publish_feed_item")).toBe(true)
  })

  it("can expose the legacy Codex CLI tool by explicit feature flag", () => {
    const previous = process.env.FESPA_ENABLE_CODEX_CLI_TOOL
    process.env.FESPA_ENABLE_CODEX_CLI_TOOL = "true"
    try {
      const tools = buildRealtimeTools()
      expect(tools.some((tool) => tool.name === "queue_codex_cli_task")).toBe(true)
    } finally {
      if (previous === undefined) {
        delete process.env.FESPA_ENABLE_CODEX_CLI_TOOL
      } else {
        process.env.FESPA_ENABLE_CODEX_CLI_TOOL = previous
      }
    }
  })
})
