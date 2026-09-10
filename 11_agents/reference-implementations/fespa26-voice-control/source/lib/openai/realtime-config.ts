import { realtimeTools } from "@/lib/openai/realtime-tools"
import { buildRealtimeInstructions } from "@/lib/realtime/instructions"
import { getEnv } from "@/lib/validation/env"
import type { SessionRequestInput } from "@/lib/validation/session"

export function buildRealtimeSessionPayload(input: SessionRequestInput) {
  const env = getEnv()
  const selectedModel = input.mode === "cheap" ? "gpt-realtime-mini" : env.OPENAI_REALTIME_MODEL

  return {
    session: {
      type: "realtime",
      model: selectedModel,
      instructions: buildRealtimeInstructions(),
      tool_choice: "auto",
      tools: realtimeTools,
      audio: {
        input: {
          turn_detection: {
            type: "semantic_vad",
          },
          transcription: {
            model: env.OPENAI_INPUT_TRANSCRIBE_MODEL,
          },
        },
        output: {
          voice: env.OPENAI_REALTIME_VOICE,
        },
      },
    },
  }
}
