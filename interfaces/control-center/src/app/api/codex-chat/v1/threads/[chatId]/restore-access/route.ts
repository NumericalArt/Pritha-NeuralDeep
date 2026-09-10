import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const key = requireIdempotencyKey(request), { chatId } = await context.params;
    const body = await readJsonBody<{ requestId: string; expectedRevision: number; proofHash: string }>(request);
    if (key !== body.requestId || !Number.isSafeInteger(body.expectedRevision)) throw new CodexChatGatewayError("invalid_request", "A request ID and exact chat revision are required.", 400);
    const result = await getCodexChatGateway().restoreAccess(chatId, body);
    return apiSuccess(result.detail, { replayed: result.replayed });
  } catch (error) { return apiError(error); }
}
