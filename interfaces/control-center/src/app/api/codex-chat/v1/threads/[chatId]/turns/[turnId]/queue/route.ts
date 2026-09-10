import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ chatId: string; turnId: string }> }) {
  try {
    const key = requireIdempotencyKey(request);
    const { chatId, turnId } = await context.params;
    const body = await readJsonBody<{ requestId: string; expectedRevision: number; action: "cancel" }>(request);
    if (body.requestId !== key || body.action !== "cancel") throw new CodexChatGatewayError("invalid_request", "Provide one matching queue cancellation request.", 400);
    const result = await getCodexChatGateway().cancelQueuedTurn(chatId, turnId, body);
    return apiSuccess(result, { replayed: result.replayed });
  } catch (error) { return apiError(error); }
}
