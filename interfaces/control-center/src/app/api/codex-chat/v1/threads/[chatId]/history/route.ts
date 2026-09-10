import { apiError, apiSuccess, integerQuery } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const url = new URL(request.url);
    return apiSuccess(await getCodexChatGateway().listTurns(chatId, { cursor: url.searchParams.get("cursor") || undefined,
      limit: integerQuery(url.searchParams.get("limit"), 20, 1, 20) }));
  } catch (error) { return apiError(error); }
}
