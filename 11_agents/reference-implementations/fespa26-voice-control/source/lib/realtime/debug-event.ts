type JsonRecord = Record<string, unknown>

export type RealtimeDebugEvent = {
  type: string
  eventId: string | null
  responseId: string | null
  itemId: string | null
  role: string | null
  status: string | null
  metadataTopic: string | null
  metadataRequestId: string | null
  textPreview: string | null
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function truncateText(value: string | null, max = 240) {
  if (!value) {
    return null
  }
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return null
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function getMetadata(payload: JsonRecord) {
  const direct = asRecord(payload.metadata)
  if (direct) {
    return direct
  }

  const response = asRecord(payload.response)
  if (response) {
    const nested = asRecord(response.metadata)
    if (nested) {
      return nested
    }
  }

  const item = asRecord(payload.item)
  if (item) {
    const nested = asRecord(item.metadata)
    if (nested) {
      return nested
    }
  }

  return null
}

export function parseRealtimeDebugEvent(raw: unknown): RealtimeDebugEvent | null {
  if (typeof raw !== "string") {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const payload = asRecord(parsed)
  if (!payload) {
    return null
  }

  const response = asRecord(payload.response)
  const item = asRecord(payload.item)
  const session = asRecord(payload.session)
  const metadata = getMetadata(payload)

  const type = readString(payload.type) ?? "unknown"
  const eventId = readString(payload.event_id) ?? readString(payload.eventId)
  const responseId = readString(payload.response_id) ?? readString(response?.id)
  const itemId =
    readString(payload.item_id) ??
    readString(payload.itemId) ??
    readString(payload.conversation_item_id) ??
    readString(item?.id)
  const role = readString(payload.role) ?? readString(item?.role)
  const status =
    readString(payload.status) ??
    readString(response?.status) ??
    readString(asRecord(payload.error)?.type)
  const textPreview = truncateText(
    readString(payload.transcript) ??
      readString(payload.text) ??
      readString(payload.instructions) ??
      readString(session?.instructions) ??
      readString(response?.instructions),
  )

  return {
    type,
    eventId,
    responseId,
    itemId,
    role,
    status,
    metadataTopic: readString(metadata?.topic),
    metadataRequestId: readString(metadata?.request_id),
    textPreview,
  }
}

export function shouldTraceRealtimeDebugEvent(type: string) {
  const normalized = type.toLowerCase()
  return (
    normalized === "error" ||
    normalized.endsWith(".done") ||
    normalized.endsWith(".completed") ||
    normalized.endsWith(".created") ||
    normalized.endsWith(".updated") ||
    normalized.endsWith(".failed") ||
    normalized.endsWith(".cancelled")
  )
}
