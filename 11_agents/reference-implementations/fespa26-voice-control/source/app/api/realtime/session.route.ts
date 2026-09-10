import { NextResponse } from "next/server"

import { createEphemeralSession, RealtimeSessionError } from "@/lib/openai/create-ephemeral-session"
import { isAllowedOrigin } from "@/lib/security/origin"
import { takeToken } from "@/lib/security/rate-limit"
import { log } from "@/lib/telemetry/logger"
import { getEnv } from "@/lib/validation/env"
import { sessionRequestSchema } from "@/lib/validation/session"

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  const env = getEnv()

  if (!env.VOICE_ENABLED) {
    return NextResponse.json({ error: "Voice feature is disabled" }, { status: 503 })
  }

  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 })
  }

  const forwardedFor = request.headers.get("x-forwarded-for")
  const rateLimitKey = forwardedFor ?? origin ?? "unknown"

  const rateLimitResult = takeToken({
    key: rateLimitKey,
    limit: env.RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
  })

  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Too many requests, please retry later" }, { status: 429 })
  }

  const json = (await request.json().catch(() => ({}))) as unknown
  const parsed = sessionRequestSchema.safeParse(json)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  try {
    const session = await createEphemeralSession(parsed.data)

    return NextResponse.json({
      client_secret: session.client_secret,
      model: parsed.data.mode === "cheap" ? "gpt-realtime-mini" : env.OPENAI_REALTIME_MODEL,
      voice: env.OPENAI_REALTIME_VOICE,
    })
  } catch (error) {
    if (error instanceof RealtimeSessionError) {
      if (error.providerCode === "unsupported_country_region_territory") {
        return NextResponse.json(
          {
            error: "OpenAI Realtime API is not available for this account region.",
            code: error.providerCode,
          },
          { status: 403 },
        )
      }

      return NextResponse.json(
        {
          error: error.message,
          code: error.providerCode ?? "provider_error",
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      )
    }

    log("error", "realtime_session_route_failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    })

    return NextResponse.json({ error: "Could not create session" }, { status: 502 })
  }
}
