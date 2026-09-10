import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ chatId: string; turnId: string }> }) {
  try {
    const { chatId, turnId } = await context.params;
    return apiSuccess(await getCodexChatGateway().historyItems(chatId, turnId, new URL(request.url).searchParams.get("cursor") || "", new URL(request.url).searchParams.get("view") === "activity"));
  } catch (error) { return apiError(error); }
}
