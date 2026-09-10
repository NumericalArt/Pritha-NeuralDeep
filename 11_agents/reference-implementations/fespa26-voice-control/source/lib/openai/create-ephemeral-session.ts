import { fetchWithProxyFallback } from "@/lib/openai/proxy-dispatcher"
import { buildRealtimeSessionPayload } from "@/lib/openai/realtime-config"
import { log } from "@/lib/telemetry/logger"
import { getEnv } from "@/lib/validation/env"
import type { SessionRequestInput } from "@/lib/validation/session"

type SessionResponse = {
  client_secret: {
    value: string
    expires_at?: number
  }
}

type RawSessionResponse = {
  client_secret?:
    | {
        value?: string
        expires_at?: number
      }
    | string
  value?: string
  expires_at?: number
}

type OpenAIErrorResponse = {
  error?: {
    code?: string
    message?: string
    type?: string
    param?: string | null
  }
}

export class RealtimeSessionError extends Error {
  status: number
  providerCode?: string

  constructor(params: { status: number; providerCode?: string; message: string }) {
    super(params.message)
    this.name = "RealtimeSessionError"
    this.status = params.status
    this.providerCode = params.providerCode
  }
}

export async function createEphemeralSession(input: SessionRequestInput) {
  const env = getEnv()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const requestUrl = `${env.OPENAI_REALTIME_BASE_URL}/realtime/client_secrets`
    const response = await fetchWithProxyFallback(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRealtimeSessionPayload(input)),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as OpenAIErrorResponse
      const providerCode = body.error?.code
      const providerMessage = body.error?.message ?? "Realtime session creation failed"

      log("error", "openai_realtime_session_failed", {
        status: response.status,
        providerCode,
        providerMessage,
      })

      throw new RealtimeSessionError({
        status: response.status,
        providerCode,
        message: providerMessage,
      })
    }

    const result = (await response.json()) as RawSessionResponse
    const normalizedClientSecret = normalizeClientSecret(result)

    if (!normalizedClientSecret) {
      log("error", "openai_realtime_session_invalid_payload", {
        responseKeys: Object.keys(result ?? {}),
      })

      throw new RealtimeSessionError({
        status: 502,
        providerCode: "invalid_provider_payload",
        message: "Provider response missing client secret",
      })
    }

    return {
      client_secret: normalizedClientSecret,
    } satisfies SessionResponse
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeClientSecret(result: RawSessionResponse) {
  if (typeof result.client_secret === "string") {
    return {
      value: result.client_secret,
      expires_at: result.expires_at,
    }
  }

  if (typeof result.client_secret?.value === "string") {
    return {
      value: result.client_secret.value,
      expires_at: result.client_secret.expires_at ?? result.expires_at,
    }
  }

  if (typeof result.value === "string") {
    return {
      value: result.value,
      expires_at: result.expires_at,
    }
  }

  return undefined
}
