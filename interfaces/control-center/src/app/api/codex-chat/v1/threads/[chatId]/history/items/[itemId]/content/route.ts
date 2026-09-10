import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ chatId: string; itemId: string }> }) {
  try {
    const { chatId, itemId } = await context.params;
    return apiSuccess(await getCodexChatGateway().historyContent(chatId, itemId, new URL(request.url).searchParams.get("cursor") || ""));
  } catch (error) { return apiError(error); }
}
