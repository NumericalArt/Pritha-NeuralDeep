import { apiError, apiSuccess, integerQuery, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const url = new URL(request.url);
    const direction = url.searchParams.get("direction") || "older";
    if (direction !== "older" && direction !== "newer") throw new CodexChatGatewayError("invalid_request", "Unknown history direction.", 400);
    return apiSuccess(await getCodexChatGateway().listTurns(chatId, {
      cursor: url.searchParams.get("cursor") || undefined,
      direction,
      limit: integerQuery(url.searchParams.get("limit"), 20, 1, 50),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { chatId } = await context.params;
    const body = await readJsonBody<{
      mode?: "after_completion";
      clientMessageId: string;
      input: [{ type: "text"; text: string }];
      attachments?: string[];
      settings?: { modelId?: string; effortId?: string; serviceTierId?: string };
    }>(request);
    if (idempotencyKey !== body.clientMessageId) {
      throw new CodexChatGatewayError("idempotency_conflict", "Idempotency-Key must match clientMessageId.", 409);
    }
    if (!Array.isArray(body.input)) throw new CodexChatGatewayError("invalid_request", "input must be an array.", 400);
    const result = await getCodexChatGateway().startTurn(chatId, body);
    return apiSuccess(result.accepted, { status: 202, replayed: result.replayed });
  } catch (error) {
    return apiError(error);
  }
}
