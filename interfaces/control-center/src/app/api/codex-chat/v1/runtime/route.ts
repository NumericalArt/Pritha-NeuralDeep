import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiSuccess(await getCodexChatGateway().runtimeStatus());
  } catch (error) {
    return apiError(error);
  }
}
