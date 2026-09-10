import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type { TaskDeliveryRequest } from "@/lib/codex-chat/delivery-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    return apiSuccess(await getCodexChatGateway().taskDeliveries(chatId, new URL(request.url).searchParams.get("runId") || undefined));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const key = requireIdempotencyKey(request);
    const body = await readJsonBody<TaskDeliveryRequest>(request);
    if (key !== body?.requestId) throw new CodexChatGatewayError("idempotency_conflict", "The request identifier must match its idempotency key.", 409);
    const { chatId } = await params;
    const result = await getCodexChatGateway().deliveryAction(chatId, body);
    return apiSuccess(result.run, { replayed: result.replayed });
  } catch (error) { return apiError(error); }
}
