import { NextResponse } from "next/server"

import { processAgentMessage } from "@/lib/chat/process-agent-message"

type RealtimeOrchestratePayload = {
  projectId?: string
  sessionId?: string
  chunkText?: string
  source?: string
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RealtimeOrchestratePayload
  const result = await processAgentMessage({
    projectId: payload.projectId,
    sessionId: payload.sessionId,
    message: payload.chunkText?.trim() ?? "",
    source: "realtime_chunk",
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    sessionId: result.sessionId,
    reply: result.reply,
    ...(result.agentEnrichment ? { agentEnrichment: result.agentEnrichment } : {}),
    source: payload.source ?? "realtime_chunk",
  })
}
