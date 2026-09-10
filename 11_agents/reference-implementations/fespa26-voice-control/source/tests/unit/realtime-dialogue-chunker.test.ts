import { describe, expect, it } from "vitest"

import { RealtimeDialogueChunker } from "../../lib/realtime/dialogue-chunker"

describe("realtime dialogue chunker", () => {
  it("dispatches a chunk only when threshold is reached with both roles", () => {
    const chunker = new RealtimeDialogueChunker({
      targetMessages: 4,
      requireAssistantLast: true,
      maxBufferMessages: 16,
    })

    expect(
      chunker.push({
        role: "user",
        text: "Планируем архитектуру",
        sourceEventType: "conversation.item.input_audio_transcription.completed",
        eventId: "u1",
      }),
    ).toBeNull()
    expect(
      chunker.push({
        role: "assistant",
        text: "Ок, сначала определим границы модулей.",
        sourceEventType: "response.output_audio_transcript.done",
        eventId: "a1",
      }),
    ).toBeNull()
    expect(
      chunker.push({
        role: "user",
        text: "Добавим память L2 и оркестратор.",
        sourceEventType: "conversation.item.input_audio_transcription.completed",
        eventId: "u2",
      }),
    ).toBeNull()
    const chunk = chunker.push({
      role: "assistant",
      text: "Согласен, после этого включим наблюдаемость.",
      sourceEventType: "response.output_audio_transcript.done",
      eventId: "a2",
    })

    expect(chunk).not.toBeNull()
    expect(chunk?.messageCount).toBe(4)
    expect(chunk?.userCount).toBe(2)
    expect(chunk?.assistantCount).toBe(2)
    expect(chunk?.text.includes("USER: Планируем архитектуру")).toBe(true)
    expect(chunk?.text.includes("ASSISTANT: Согласен, после этого включим наблюдаемость.")).toBe(
      true,
    )
  })

  it("does not dispatch when last message is user and assistant-last is required", () => {
    const chunker = new RealtimeDialogueChunker({
      targetMessages: 2,
      requireAssistantLast: true,
      maxBufferMessages: 8,
    })
    expect(
      chunker.push({
        role: "assistant",
        text: "Нужен апдейт?",
        sourceEventType: "response.output_audio_transcript.done",
        eventId: "a1",
      }),
    ).toBeNull()
    const chunk = chunker.push({
      role: "user",
      text: "Да, продолжай.",
      sourceEventType: "conversation.item.input_audio_transcription.completed",
      eventId: "u1",
    })
    expect(chunk).toBeNull()
  })
})
