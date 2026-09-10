import { describe, expect, it } from "vitest"

import {
  extractFinalizedDialogueTurn,
  FinalizedUserTurnDeduper,
  parseRealtimeEvent,
} from "../../lib/realtime/final-turn"

describe("realtime final turn bridge helpers", () => {
  it("parses completed input audio transcription as user final turn", () => {
    const raw = JSON.stringify({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "Build strict TypeScript runtime",
      event_id: "evt_1",
    })
    const parsed = parseRealtimeEvent(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.role).toBe("user")

    const finalized = parsed ? extractFinalizedDialogueTurn(parsed) : null
    expect(finalized?.role).toBe("user")
    expect(finalized?.text).toBe("Build strict TypeScript runtime")
    expect(finalized?.eventId).toBe("evt_1")
  })

  it("ignores non-final events", () => {
    const raw = JSON.stringify({
      type: "conversation.item.input_audio_transcription.delta",
      transcript: "partial text",
    })
    const parsed = parseRealtimeEvent(raw)
    expect(parsed).not.toBeNull()
    const finalized = parsed ? extractFinalizedDialogueTurn(parsed) : null
    expect(finalized).toBeNull()
  })

  it("parses finalized assistant output transcript", () => {
    const raw = JSON.stringify({
      type: "response.output_audio_transcript.done",
      transcript: "Давай разобьем задачу на этапы.",
      event_id: "evt_assistant_1",
    })
    const parsed = parseRealtimeEvent(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.role).toBe("assistant")
    const finalized = parsed ? extractFinalizedDialogueTurn(parsed) : null
    expect(finalized?.role).toBe("assistant")
    expect(finalized?.eventId).toBe("evt_assistant_1")
  })

  it("returns null for invalid json payload", () => {
    const parsed = parseRealtimeEvent("{invalid}")
    expect(parsed).toBeNull()
  })

  it("dedupes repeated final turns by event id and text fallback", () => {
    const deduper = new FinalizedUserTurnDeduper(20_000)

    expect(
      deduper.shouldDispatch({
        eventId: "evt_a",
        text: "I prefer strict typing",
        nowMs: 1_000,
      }),
    ).toBe(true)
    expect(
      deduper.shouldDispatch({
        eventId: "evt_a",
        text: "I prefer strict typing",
        nowMs: 1_500,
      }),
    ).toBe(false)

    expect(
      deduper.shouldDispatch({
        eventId: null,
        text: "same fallback text",
        nowMs: 2_000,
      }),
    ).toBe(true)
    expect(
      deduper.shouldDispatch({
        eventId: null,
        text: "same fallback text",
        nowMs: 2_500,
      }),
    ).toBe(false)
  })
})
