import { apiError, apiSuccess, readJsonBody } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const body = await readJsonBody<{ expectedTurnId: string }>(request);
    if (!/^turn_[A-Za-z0-9]+$/.test(body.expectedTurnId || "")) throw new CodexChatGatewayError("invalid_request", "Select the exact turn to stop.", 400);
    return apiSuccess(await getCodexChatGateway().interruptTurn(chatId,body.expectedTurnId));
  } catch (error) {
    return apiError(error);
  }
}
