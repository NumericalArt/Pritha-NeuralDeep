import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const key = requireIdempotencyKey(request);
    const body = await readJsonBody<{ clientMessageId: string; text: string; runId?: string }>(request);
    if (key !== body?.clientMessageId) throw new CodexChatGatewayError("idempotency_conflict", "Idempotency-Key must match clientMessageId.", 409);
    const { chatId } = await params;
    const result = await getCodexChatGateway().applyDeliveryBudgetIntent(chatId, body);
    return apiSuccess(result.run, { replayed: result.replayed });
  } catch (error) { return apiError(error); }
}
