"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseRealtimeDebugEvent, shouldTraceRealtimeDebugEvent } from "@/lib/realtime/debug-event"
import {
  extractFinalizedDialogueTurn,
  FinalizedUserTurnDeduper,
  parseRealtimeEvent,
} from "@/lib/realtime/final-turn"
import { buildRealtimeInstructions } from "@/lib/realtime/instructions"
import { buildRealtimeSessionUpdateEvent } from "@/lib/realtime/session-events"

type CallMode = "default" | "cheap"
export type CallPhase = "idle" | "connecting" | "listening" | "speaking" | "error"

export type TranscriptItem = {
  id: string
  role: "user" | "assistant" | "system"
  text: string
}

type StartCallOptions = {
  mode: CallMode
}

type SessionErrorPayload = {
  error?: string
  code?: string
}

type RealtimeCallResponse = {
  answerSdp: string
}

type RealtimeFunctionCallEvent = {
  type?: string
  item?: {
    type?: string
    name?: string
    call_id?: string
    arguments?: string
  }
}

type FinalUserTurnPayload = {
  role: "user" | "assistant"
  text: string
  sourceEventType: string
  eventId: string | null
}

type FinalUserTurnDispatchResult = boolean

type UseRealtimeCallOptions = {
  onFinalDialogueTurn?: (
    payload: FinalUserTurnPayload,
  ) => Promise<FinalUserTurnDispatchResult> | FinalUserTurnDispatchResult
  onRealtimeSessionUpdated?: () => void
}

export function useRealtimeCall(options: UseRealtimeCallOptions = {}) {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [remoteAudioReady, setRemoteAudioReady] = useState(false)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [localAudioStream, setLocalAudioStream] = useState<MediaStream | null>(null)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localTrackRef = useRef<MediaStreamTrack | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const eventsChannelRef = useRef<RTCDataChannel | null>(null)
  const finalUserTurnCallbackRef = useRef(options.onFinalDialogueTurn)
  const sessionUpdatedCallbackRef = useRef(options.onRealtimeSessionUpdated)
  const finalUserTurnDeduperRef = useRef(new FinalizedUserTurnDeduper())

  useEffect(() => {
    finalUserTurnCallbackRef.current = options.onFinalDialogueTurn
    sessionUpdatedCallbackRef.current = options.onRealtimeSessionUpdated
  }, [options.onFinalDialogueTurn, options.onRealtimeSessionUpdated])

  function bindRemoteAudioElement(element: HTMLAudioElement | null) {
    remoteAudioRef.current = element
  }

  const updateSessionInstructions = useCallback(async (enrichmentText: string | null) => {
    const eventsChannel = eventsChannelRef.current
    if (!eventsChannel || eventsChannel.readyState !== "open") {
      return false
    }

    const event = buildRealtimeSessionUpdateEvent(buildRealtimeInstructions({ enrichmentText }))
    const raw = JSON.stringify(event)
    eventsChannel.send(raw)
    await sendTelemetry("realtime_event_outbound", { raw })
    return true
  }, [])

  async function startCall(options: StartCallOptions) {
    if (phase === "connecting") {
      return
    }

    setError(null)
    setPhase("connecting")
    setRemoteAudioReady(false)
    finalUserTurnDeduperRef.current.reset()
    const t0 = performance.now()

    try {
      const sessionResponse = await fetch("/api/realtime/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: options.mode, locale: "ru-RU" }),
      })

      if (!sessionResponse.ok) {
        const errorPayload = (await sessionResponse.json().catch(() => ({}))) as SessionErrorPayload

        if (errorPayload.code === "unsupported_country_region_territory") {
          throw new Error(
            "OpenAI Realtime недоступен для текущего региона аккаунта. Нужен поддерживаемый регион.",
          )
        }

        if (errorPayload.error) {
          throw new Error(errorPayload.error)
        }

        throw new Error(`Session failed with status ${sessionResponse.status}`)
      }

      const sessionData = (await sessionResponse.json()) as {
        client_secret: { value: string }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setLocalAudioStream(stream)

      const peerConnection = new RTCPeerConnection()
      const track = stream.getAudioTracks()[0]
      if (!track) {
        throw new Error("No local audio track available")
      }

      localTrackRef.current = track
      peerConnection.addTrack(track, stream)

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          setPhase("listening")
        }
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          setPhase("error")
          setError("Connection lost. Try reconnect.")
        }
      }

      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0]
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream
          void remoteAudioRef.current.play()
          setRemoteAudioReady(true)
          setLastLatencyMs(Math.round(performance.now() - t0))
        }
      }

      const eventsChannel = peerConnection.createDataChannel("oai-events")
      eventsChannelRef.current = eventsChannel
      eventsChannel.onmessage = (event) => {
        const debugEvent = parseRealtimeDebugEvent(event.data)
        if (debugEvent && shouldTraceRealtimeDebugEvent(debugEvent.type)) {
          void sendTelemetry("realtime_event_inbound", {
            raw: event.data,
          })
        }
        if (debugEvent?.type === "session.updated") {
          sessionUpdatedCallbackRef.current?.()
        }

        void maybeHandleRealtimeToolCall(event.data, eventsChannel)

        let parsed: ReturnType<typeof parseRealtimeEvent> = null
        try {
          parsed = parseRealtimeEvent(event.data)
        } catch {
          return
        }

        if (!parsed || !parsed.text) {
          return
        }

        setTranscript((items) => [
          ...items.slice(-20),
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            role: parsed.role,
            text: parsed.text,
          },
        ])

        const finalized = extractFinalizedDialogueTurn(parsed)
        if (!finalized) {
          return
        }
        if (
          !finalUserTurnDeduperRef.current.shouldDispatch({
            eventId: finalized.eventId,
            text: finalized.text,
          })
        ) {
          return
        }

        const callback = finalUserTurnCallbackRef.current
        if (!callback) {
          return
        }
        void sendTelemetry("bridge_turn_finalized", {
          role: finalized.role,
          sourceEventType: finalized.sourceEventType,
          charCount: finalized.text.length,
        })
        void Promise.resolve(
          callback({
            role: finalized.role,
            text: finalized.text,
            sourceEventType: finalized.sourceEventType,
            eventId: finalized.eventId,
          }),
        )
          .then((dispatchResult) => {
            if (!dispatchResult) {
              void sendTelemetry("bridge_chat_buffered")
              return
            }

            void sendTelemetry("bridge_chat_dispatch_ok")
          })
          .catch((err) =>
            sendTelemetry("bridge_chat_dispatch_failed", {
              message: err instanceof Error ? err.message : "unknown_bridge_error",
            }),
          )
      }

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      const sdpResponse = await fetch("/api/realtime/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerSdp: offer.sdp ?? "",
          ephemeralKey: sessionData.client_secret.value,
        }),
      })

      if (!sdpResponse.ok) {
        const errorPayload = (await sdpResponse.json().catch(() => ({}))) as SessionErrorPayload
        throw new Error(
          errorPayload.error ?? `Realtime call failed with status ${sdpResponse.status}`,
        )
      }

      const callPayload = (await sdpResponse.json()) as RealtimeCallResponse
      const answerSdp = callPayload.answerSdp
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      })

      peerConnectionRef.current = peerConnection
      await sendTelemetry("call_started", {
        mode: options.mode,
      })
    } catch (err) {
      setPhase("error")
      setError(err instanceof Error ? err.message : "Unknown call error")
      await sendTelemetry("call_failed")
      stopCall()
    }
  }

  async function stopCall() {
    setPhase("idle")
    setRemoteAudioReady(false)
    finalUserTurnDeduperRef.current.reset()

    if (localTrackRef.current) {
      localTrackRef.current.stop()
      localTrackRef.current = null
    }

    if (localAudioStream) {
      localAudioStream.getTracks().forEach((track) => {
        track.stop()
      })
      setLocalAudioStream(null)
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    if (eventsChannelRef.current) {
      eventsChannelRef.current.close()
      eventsChannelRef.current = null
    }

    await sendTelemetry("call_stopped")
  }

  async function reconnect(mode: CallMode) {
    await stopCall()
    await startCall({ mode })
  }

  function toggleMute() {
    if (!localTrackRef.current) {
      return
    }

    const nextMuted = !isMuted
    localTrackRef.current.enabled = !nextMuted
    setIsMuted(nextMuted)
  }

  return {
    phase,
    isMuted,
    error,
    transcript,
    remoteAudioReady,
    lastLatencyMs,
    localAudioStream,
    bindRemoteAudioElement,
    updateSessionInstructions,
    startCall,
    stopCall,
    reconnect,
    toggleMute,
  }
}

async function sendTelemetry(event: string, detail?: Record<string, unknown>) {
  await fetch("/api/realtime/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event,
      detail,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => undefined)
}

async function maybeHandleRealtimeToolCall(raw: string, eventsChannel: RTCDataChannel) {
  let parsed: RealtimeFunctionCallEvent
  try {
    parsed = JSON.parse(raw) as RealtimeFunctionCallEvent
  } catch {
    return
  }

  if (parsed.type !== "response.output_item.done") {
    return
  }
  const item = parsed.item
  if (item?.type !== "function_call" || !item.name || !item.call_id) {
    return
  }

  let args: Record<string, unknown> = {}
  try {
    args = item.arguments ? (JSON.parse(item.arguments) as Record<string, unknown>) : {}
  } catch {
    args = {}
  }

  const toolResponse = await fetch("/api/realtime/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: item.name,
      arguments: args,
    }),
  })
  const output = await toolResponse.json().catch(() => ({
    ok: false,
    error: "tool response was not JSON",
  }))

  if (eventsChannel.readyState !== "open") {
    return
  }
  eventsChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(output),
      },
    }),
  )
  eventsChannel.send(JSON.stringify({ type: "response.create" }))
}
