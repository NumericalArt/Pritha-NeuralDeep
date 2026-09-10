import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type { TurnRecoveryAction, TurnRecoveryResult } from "@/lib/codex-chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string; turnId: string }> },
) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { chatId, turnId } = await context.params;
    const body = await readJsonBody<{ recoveryId: string; action: TurnRecoveryAction; expectedAttemptId?: string | null }>(request);
    if (idempotencyKey !== body.recoveryId) {
      throw new CodexChatGatewayError("idempotency_conflict", "Idempotency-Key must match recoveryId.", 409);
    }
    if (!["resume", "retry", "cancel", "reconcile"].includes(String(body.action))) {
      throw new CodexChatGatewayError("invalid_request", "Recovery action must be resume, retry, cancel or reconcile.", 400);
    }
    const detail = await getCodexChatGateway().recoverTurn(chatId, turnId, body.action, {requestId:body.recoveryId,expectedAttemptId:body.expectedAttemptId});
    const result: TurnRecoveryResult = { action: body.action, turnId, detail };
    return apiSuccess(result, { status: body.action === "cancel" || body.action === "reconcile" ? 200 : 202 });
  } catch (error) {
    return apiError(error);
  }
}
