import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type { CreateTaskLinkRequest } from "@/lib/codex-chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { chatId } = await params;
    const body = await readJsonBody<CreateTaskLinkRequest>(request);
    if (idempotencyKey !== `${chatId}:${body.taskId}:${body.mode}`) {
      throw new CodexChatGatewayError("idempotency_conflict", "Idempotency-Key must identify the chat, task and link mode.", 409);
    }
    return apiSuccess(await getCodexChatGateway().createTaskLink(chatId, body));
  } catch (error) {
    return apiError(error);
  }
}
