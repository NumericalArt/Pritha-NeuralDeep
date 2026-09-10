import type { FinalizedDialogueTurn } from "@/lib/realtime/final-turn"

export type DialogueChunk = {
  messageCount: number
  userCount: number
  assistantCount: number
  text: string
  sourceEvents: string[]
}

type DialogueChunkerConfig = {
  targetMessages: number
  requireAssistantLast: boolean
  maxBufferMessages: number
}

const DEFAULT_CONFIG: DialogueChunkerConfig = {
  targetMessages: 6,
  requireAssistantLast: true,
  maxBufferMessages: 24,
}

function clampConfig(config?: Partial<DialogueChunkerConfig>): DialogueChunkerConfig {
  return {
    targetMessages: Math.max(2, config?.targetMessages ?? DEFAULT_CONFIG.targetMessages),
    requireAssistantLast: config?.requireAssistantLast ?? DEFAULT_CONFIG.requireAssistantLast,
    maxBufferMessages: Math.max(4, config?.maxBufferMessages ?? DEFAULT_CONFIG.maxBufferMessages),
  }
}

export class RealtimeDialogueChunker {
  private config: DialogueChunkerConfig
  private buffer: FinalizedDialogueTurn[] = []

  constructor(config?: Partial<DialogueChunkerConfig>) {
    this.config = clampConfig(config)
  }

  push(turn: FinalizedDialogueTurn): DialogueChunk | null {
    this.buffer.push(turn)
    if (this.buffer.length > this.config.maxBufferMessages) {
      this.buffer.splice(0, this.buffer.length - this.config.maxBufferMessages)
    }

    if (this.buffer.length < this.config.targetMessages) {
      return null
    }

    const candidate = this.buffer.slice(-this.config.targetMessages)
    const userCount = candidate.filter((item) => item.role === "user").length
    const assistantCount = candidate.length - userCount
    const hasBothSides = userCount > 0 && assistantCount > 0
    const assistantLast = candidate.at(-1)?.role === "assistant"

    if (!hasBothSides) {
      return null
    }
    if (this.config.requireAssistantLast && !assistantLast) {
      return null
    }

    this.buffer.length = 0
    return {
      messageCount: candidate.length,
      userCount,
      assistantCount,
      sourceEvents: candidate.map((item) => item.sourceEventType),
      text: formatChunkMessage(candidate),
    }
  }

  reset() {
    this.buffer.length = 0
  }
}

function formatChunkMessage(turns: FinalizedDialogueTurn[]) {
  const lines = turns.map((turn, index) => `${index + 1}. ${turn.role.toUpperCase()}: ${turn.text}`)
  return ["[Realtime dialogue chunk]", ...lines].join("\n").slice(0, 2200)
}
