import { NextResponse } from "next/server"
import { parseRealtimeDebugEvent } from "@/lib/realtime/debug-event"
import { realtimeDebugEventsRepo } from "@/lib/repositories/realtime-debug-events-repo"
import { log } from "@/lib/telemetry/logger"
import { recordMetric } from "@/lib/telemetry/metrics"
import { telemetrySchema } from "@/lib/validation/session"

export async function POST(request: Request) {
  const json = (await request.json().catch(() => ({}))) as unknown
  const parsed = telemetrySchema.safeParse(json)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid telemetry payload" }, { status: 400 })
  }

  log("info", "client_telemetry", parsed.data)
  recordMetric({
    name: parsed.data.event,
    value: 1,
  })

  if (
    (parsed.data.event === "realtime_event_inbound" ||
      parsed.data.event === "realtime_event_outbound") &&
    typeof parsed.data.detail?.raw === "string"
  ) {
    const debugEvent = parseRealtimeDebugEvent(parsed.data.detail.raw)
    if (debugEvent) {
      realtimeDebugEventsRepo.append(
        parsed.data.event === "realtime_event_inbound" ? "inbound" : "outbound",
        debugEvent,
        parsed.data.detail.raw,
      )
    }
  }

  return NextResponse.json({ ok: true })
}
