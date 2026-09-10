import { apiError, apiSuccess, integerQuery, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const group = url.searchParams.get("group") || "all";
    if (!['all', 'my_chats', 'voice_work', 'other_sessions'].includes(group)) {
      throw new CodexChatGatewayError("invalid_request", "Unknown thread group.", 400);
    }
    const archivedValue = url.searchParams.get("archived") || "false";
    if (archivedValue !== "true" && archivedValue !== "false") {
      throw new CodexChatGatewayError("invalid_request", "archived must be true or false.", 400);
    }
    const search = url.searchParams.get("search") || "";
    if (Array.from(search).length > 200) throw new CodexChatGatewayError("field_limit_exceeded", "Thread search exceeds 200 characters.", 400);
    return apiSuccess(await getCodexChatGateway().listThreads({
      group,
      archived: archivedValue === "true",
      search,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: integerQuery(url.searchParams.get("limit"), 30, 1, 50),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await readJsonBody<{
      clientThreadId: string;
      title?: string;
      source: "chat";
      settings?: { modelId?: string; effortId?: string; serviceTierId?: string };
      initialTurn?: {
        clientMessageId: string;
        input: [{ type: "text"; text: string }];
      attachments?: string[];
        settings?: { modelId?: string; effortId?: string; serviceTierId?: string };
      };
    }>(request);
    if (idempotencyKey !== body.clientThreadId) {
      throw new CodexChatGatewayError("idempotency_conflict", "Idempotency-Key must match clientThreadId.", 409);
    }
    if (body.title != null && Array.from(String(body.title)).length > 120) {
      throw new CodexChatGatewayError("field_limit_exceeded", "Thread title exceeds 120 characters.", 400);
    }
    if (body.initialTurn) {
      const result = await getCodexChatGateway().createThreadWithFirstTurn({ ...body, initialTurn: body.initialTurn });
      return apiSuccess(result.data, { status: result.replayed ? 200 : 202, replayed: result.replayed });
    }
    const result = await getCodexChatGateway().createThread(body);
    return apiSuccess(result.detail, { status: result.replayed ? 200 : 201, replayed: result.replayed });
  } catch (error) {
    return apiError(error);
  }
}
