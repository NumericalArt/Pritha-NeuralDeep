import { describe, expect, it } from "vitest"

import {
  buildRealtimeEnrichmentSpokenText,
  buildRealtimeInstructions,
} from "../../lib/realtime/instructions"
import { buildRealtimeSessionUpdateEvent } from "../../lib/realtime/session-events"

describe("realtime instructions", () => {
  it("builds base instructions without a Codex enrichment fragment", () => {
    const instructions = buildRealtimeInstructions()

    expect(instructions.includes("FESPA26")).toBe(true)
    expect(instructions.includes("Default to Russian")).toBe(true)
    expect(instructions.includes("queue_codex_system_task")).toBe(true)
    expect(instructions.includes("run_codex_app_task")).toBe(true)
    expect(instructions.includes("Добавлю важную деталь")).toBe(false)
  })

  it("wraps Codex enrichment with test markers", () => {
    const spoken = buildRealtimeEnrichmentSpokenText("Это релевантная вставка.")
    const instructions = buildRealtimeInstructions({
      enrichmentText: "Это релевантная вставка.",
    })

    expect(spoken).toBe("Добавлю важную деталь. Это релевантная вставка. ")
    expect(instructions.includes(spoken)).toBe(true)
  })

  it("builds a Realtime session.update event", () => {
    const event = buildRealtimeSessionUpdateEvent("answer in Russian", "evt_test")

    expect(event).toEqual({
      type: "session.update",
      event_id: "evt_test",
      session: {
        type: "realtime",
        instructions: "answer in Russian",
      },
    })
  })
})
