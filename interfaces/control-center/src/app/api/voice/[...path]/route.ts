import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  buildPrithaRealtimeTools,
  getPrithaRuntimeSettings,
} from '@/lib/realtime/pritha-runtime';
import { voiceRuntimeCredentials } from '../../../../../../../scripts/neuraldeep/voice-runtime-config.mjs';
import { getNeuralDeepAdmissionCoordinator } from '@/lib/codex-chat/admission-coordinator';
import {
  createVoiceSession,
  getVoiceSession,
  voiceOwner,
  acceptVoiceTurn,
  interruptVoiceSession,
  updateVoiceContext,
  completeBrowserTool,
  takeVoiceAudio,
  closeVoiceSession,
  type VoiceSession,
  type VoiceEvent,
} from '@/lib/voice/sessions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const cookieName = 'pritha-voice-client';
function client(request: Request) {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || ''
  );
}
async function json(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('voice_payload_invalid');
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128000) throw new Error('voice_payload_limit');
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const value = JSON.parse(Buffer.concat(parts).toString());
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('voice_payload_invalid');
  return value as Record<string, unknown>;
}
function stream(s: VoiceSession, request: Request) {
  const last = Number(request.headers.get('last-event-id') || 0);
  if (!Number.isSafeInteger(last) || last < 0)
    throw new Error('voice_event_cursor_invalid');
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const send = (event: VoiceEvent) => {
          if (closed) return;
          try {
            if ((controller.desiredSize || 0) < -2 * 1024 * 1024) {
              cleanup();
              controller.close();
              return;
            }
            controller.enqueue(
              encoder.encode(
                `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`,
              ),
            );
          } catch {
            cleanup();
          }
        };
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            cleanup();
          }
        }, 15000);
        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          s.listeners.delete(send);
          request.signal.removeEventListener('abort', cleanup);
        };
        request.signal.addEventListener('abort', cleanup, { once: true });
        if (
          last > s.sequence ||
          (last && s.events[0] && last < s.events[0].id - 1)
        ) {
          send({
            id: s.sequence,
            type: 'session.resync_required',
            sessionId: s.id,
          });
          cleanup();
          controller.close();
          return;
        }
        for (const event of s.events) if (event.id > last) send(event);
        s.listeners.add(send);
      },
      cancel() {
        cleanup();
      },
    },
    { highWaterMark: 2 * 1024 * 1024, size: (value) => value.byteLength },
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
async function handle(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path[0] === 'status' && request.method === 'GET')
      return NextResponse.json({
        ok: true,
        transport: getPrithaRuntimeSettings().voiceTransport,
        neuraldeep: {
          configured: Boolean(voiceRuntimeCredentials().key),
          experimental: true,
        },
        audio: { maxSeconds: 120, maxBytes: 4 * 1024 * 1024 },
      });
    if (path[0] !== 'sessions')
      return NextResponse.json(
        { ok: false, error: 'not_found' },
        { status: 404 },
      );
    if (path.length === 1 && request.method === 'POST') {
      if (!voiceRuntimeCredentials().key)
        throw new Error('provider_not_configured');
      const payload = await json(request),
        token = /^[a-f0-9-]{36}$/.test(client(request))
          ? client(request)
          : randomUUID();
      const s = createVoiceSession(
          voiceOwner(token),
          payload.musicControlEnabled === true,
        ),
        response = NextResponse.json({
          ok: true,
          sessionId: s.id,
          settings: s.settings,
          tools: buildPrithaRealtimeTools({
            musicControlEnabled: s.musicControlEnabled,
          }).map((t) => t.name),
          experimental: true,
        });
      response.cookies.set(cookieName, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: new URL(request.url).protocol === 'https:',
        path: '/api/voice',
        maxAge: 86400,
      });
      return response;
    }
    if (!client(request)) throw new Error('voice_session_unavailable');
    const s = getVoiceSession(path[1], voiceOwner(client(request)));
    if (path.length === 2 && request.method === 'DELETE') {
      closeVoiceSession(s);
      return NextResponse.json({ ok: true });
    }
    const action = path[2];
    if (action === 'events' && request.method === 'GET')
      return stream(s, request);
    if (action === 'audio' && path[3] && request.method === 'GET')
      return new Response(new Uint8Array(takeVoiceAudio(s, path[3])), {
        headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
      });
    if (action === 'turns' && path[3] && request.method === 'GET')
      return NextResponse.json({
        ok: true,
        turn: getNeuralDeepAdmissionCoordinator()
          .voiceJournal()
          .turn(s.id, path[3]),
      });
    if (request.method !== 'POST')
      return NextResponse.json(
        { ok: false, error: 'not_found' },
        { status: 404 },
      );
    if (action === 'interrupt') {
      interruptVoiceSession(s);
      return NextResponse.json({ ok: true });
    }
    if (
      action === 'turns' &&
      request.headers.get('content-type')?.startsWith('audio/wav')
    ) {
      const reader = request.body?.getReader();
      if (!reader) throw new Error('voice_payload_invalid');
      let size = 0;
      const parts: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4 * 1024 * 1024) throw new Error('voice_payload_limit');
          parts.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return NextResponse.json(
        acceptVoiceTurn(s, {
          clientTurnId: request.headers.get('x-voice-turn-id') || '',
          audio: Buffer.concat(parts),
        }),
      );
    }
    const payload = await json(request);
    if (action === 'turns')
      return NextResponse.json(
        acceptVoiceTurn(s, {
          clientTurnId: String(payload.clientTurnId || ''),
          text: typeof payload.text === 'string' ? payload.text : '',
          hostNotification: payload.hostNotification === true,
        }),
      );
    if (action === 'context') {
      updateVoiceContext(s, payload);
      return NextResponse.json({ ok: true });
    }
    if (action === 'browser-results')
      return NextResponse.json(
        completeBrowserTool(
          s,
          String(payload.operationId || ''),
          payload.result,
        ),
      );
    return NextResponse.json(
      { ok: false, error: 'not_found' },
      { status: 404 },
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : '',
      code = /^(?:voice_[a-z_]+|provider_not_configured)$/.test(raw)
        ? raw
        : 'voice_request_failed';
    return NextResponse.json(
      { ok: false, error: code },
      {
        status:
          code === 'voice_session_unavailable'
            ? 404
            : code.endsWith('_conflict') || code === 'voice_turn_busy'
              ? 409
              : code.endsWith('_limit')
                ? 413
                : 400,
      },
    );
  }
}
export const GET = handle,
  POST = handle,
  DELETE = handle;
