import { apiError, apiSuccess, readJsonBody } from "@/lib/codex-chat/http";
import { recordTaskChatUiActivity, type TaskChatUiActivityInput } from "@/lib/codex-chat/ui-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<TaskChatUiActivityInput>(request);
    return apiSuccess(await recordTaskChatUiActivity(body));
  } catch (error) {
    return apiError(error);
  }
}
