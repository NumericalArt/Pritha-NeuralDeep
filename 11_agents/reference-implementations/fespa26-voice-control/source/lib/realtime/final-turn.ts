export type ParsedRealtimeEvent = {
  type: string
  role: "user" | "assistant" | "system"
  text: string
  eventId: string | null
}

export type FinalizedDialogueTurn = {
  role: "user" | "assistant"
  text: string
  sourceEventType: string
  eventId: string | null
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().replace(/\s+/g, " ")
}

function normalizeRole(rawRole: unknown, type: string): ParsedRealtimeEvent["role"] {
  if (rawRole === "user" || rawRole === "assistant" || rawRole === "system") {
    return rawRole
  }
  if (type.includes("input_audio")) {
    return "user"
  }
  if (type.includes("response")) {
    return "assistant"
  }
  return "system"
}

function getEventId(payload: Record<string, unknown>) {
  const candidates = [
    payload.event_id,
    payload.eventId,
    payload.item_id,
    payload.itemId,
    payload.conversation_item_id,
    payload.conversationItemId,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
    }
  }
  return null
}

export function parseRealtimeEvent(raw: unknown): ParsedRealtimeEvent | null {
  if (typeof raw !== "string") {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") {
    return null
  }
  const payload = parsed as Record<string, unknown>
  const type = typeof payload.type === "string" ? payload.type : ""
  const text = normalizeText(payload.transcript ?? payload.text)
  const role = normalizeRole(payload.role, type)

  if (!type && !text) {
    return null
  }

  return {
    type,
    role,
    text,
    eventId: getEventId(payload),
  }
}

export function extractFinalizedDialogueTurn(
  event: ParsedRealtimeEvent,
): FinalizedDialogueTurn | null {
  if (event.role !== "user" && event.role !== "assistant") {
    return null
  }
  if (!event.text) {
    return null
  }

  const normalizedType = event.type.toLowerCase()

  const isFinalizedUser =
    event.role === "user" && normalizedType.includes("input_audio_transcription.completed")
  const isFinalizedAssistant =
    event.role === "assistant" &&
    (normalizedType.includes("output_audio_transcript.done") ||
      normalizedType.includes("output_text.done"))

  if (!isFinalizedUser && !isFinalizedAssistant) {
    return null
  }

  return {
    role: event.role,
    text: event.text,
    sourceEventType: event.type,
    eventId: event.eventId,
  }
}

export class FinalizedUserTurnDeduper {
  private seen = new Map<string, number>()
  private ttlMs: number

  constructor(ttlMs = 12_000) {
    this.ttlMs = Math.max(1_000, ttlMs)
  }

  shouldDispatch(input: { eventId: string | null; text: string; nowMs?: number }) {
    const now = input.nowMs ?? Date.now()
    const key = input.eventId ?? input.text.toLowerCase()
    if (!key.trim()) {
      return false
    }

    for (const [candidate, timestamp] of this.seen.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.seen.delete(candidate)
      }
    }

    const current = this.seen.get(key)
    if (typeof current === "number") {
      return false
    }

    this.seen.set(key, now)
    return true
  }

  reset() {
    this.seen.clear()
  }
}
