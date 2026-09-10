import { NextResponse } from "next/server"

import { fetchWithProxyFallback } from "@/lib/openai/proxy-dispatcher"
import { isAllowedOrigin } from "@/lib/security/origin"
import { log } from "@/lib/telemetry/logger"
import { getEnv } from "@/lib/validation/env"
import { realtimeCallSchema } from "@/lib/validation/session"

type ProviderErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  const env = getEnv()

  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 })
  }

  const payload = (await request.json().catch(() => ({}))) as unknown
  const parsed = realtimeCallSchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  try {
    const requestUrl = `${env.OPENAI_REALTIME_BASE_URL}/realtime/calls`
    const response = await fetchWithProxyFallback(requestUrl, {
      method: "POST",
      body: parsed.data.offerSdp,
      headers: {
        Authorization: `Bearer ${parsed.data.ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const providerBody = (await response.json().catch(() => ({}))) as ProviderErrorResponse
      const providerCode = providerBody.error?.code
      const providerMessage = providerBody.error?.message ?? "Realtime call failed"

      log("error", "openai_realtime_call_failed", {
        status: response.status,
        providerCode,
        providerMessage,
      })

      return NextResponse.json(
        {
          error: providerMessage,
          code: providerCode ?? "provider_error",
        },
        { status: response.status },
      )
    }

    const answerSdp = await response.text()

    return NextResponse.json({ answerSdp })
  } catch (error) {
    log("error", "realtime_call_route_failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    })

    return NextResponse.json({ error: "Could not create realtime call" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
