import { apiError } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type { ChatEventRecord } from "@/lib/codex-chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function frame(record: ChatEventRecord, compact = false) {
  if (compact && ["item.started", "item.completed", "message.completed", "message.delta"].includes(record.event)) record = { event: "history.changed", data: { ...record.data, payload: {} } };
  else if (compact && record.event.startsWith("turn.")) record = { ...record, data: { ...record.data, payload: {} } };
  return `id: ${record.data.eventId}\nevent: ${record.event}\ndata: ${JSON.stringify(record.data)}\n\n`;
}

export async function GET(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const gateway = getCodexChatGateway();
    const detail = await gateway.threadDetail(chatId);
    const url = new URL(request.url);
    const afterEventId = request.headers.get("last-event-id") || url.searchParams.get("afterEventId");
    const replay = gateway.eventsAfter(chatId, afterEventId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (record: ChatEventRecord) => {
          if (!closed) controller.enqueue(encoder.encode(frame(record, url.searchParams.get("history") === "compact")));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
          controller.close();
        };
        let unsubscribe: (() => void) | null = null;
        let heartbeat: NodeJS.Timeout | null = null;

        if (replay.reset) {
          send(gateway.streamReset(chatId, "server_restarted"));
          heartbeat = setInterval(() => undefined, 60_000);
          close();
          return;
        }

        for (const record of replay.events) send(record);
        unsubscribe = gateway.subscribe(chatId, send, close);
        gateway.connectionReady(chatId, detail.thread.runtime);
        heartbeat = setInterval(() => gateway.heartbeat(chatId), 15_000);
        request.signal.addEventListener("abort", close, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
