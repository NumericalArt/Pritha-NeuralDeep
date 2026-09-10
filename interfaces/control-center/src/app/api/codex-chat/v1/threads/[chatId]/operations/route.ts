import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type { OperationAction, OperationRequest } from "@/lib/codex-chat/operation-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params, query = new URL(request.url).searchParams;
    return apiSuccess(await getCodexChatGateway().operationDecision(chatId, query.get("runId") || "", query.get("action") as OperationAction));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new CodexChatGatewayError("operation_origin_invalid", "Подтвердите операцию в этом Control Center.", 403);
    const key = requireIdempotencyKey(request), body = await readJsonBody<OperationRequest>(request);
    if (body?.requestId !== key) throw new CodexChatGatewayError("idempotency_conflict", "Request identifiers must match.", 409);
    const { chatId } = await params;
    return apiSuccess(await getCodexChatGateway().operationDecision(chatId, body.runId, body.action, body));
  } catch (error) { return apiError(error); }
}
