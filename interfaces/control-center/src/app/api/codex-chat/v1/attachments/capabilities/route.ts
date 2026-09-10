import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { CodexChatGatewayError } from "@/lib/codex-chat/gateway";
import { getCodexModelCatalog } from "@/lib/settings/codex-model-catalog-server";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { attachmentSupport } from "../../../../../../../../../scripts/neuraldeep/attachment-policy.mjs";
import { readAttachmentTransport } from "../../../../../../../../../scripts/neuraldeep/attachment-transport.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url), modelId = url.searchParams.get("model"), route = url.searchParams.get("path") || "initial";
    if (!modelId || modelId.length > 192 || !["initial", "resume"].includes(route)) throw new CodexChatGatewayError("invalid_request", "Specify the selected model and initial or resume path.", 400);
    const root = resolveTechscopeRoot(), catalog = await getCodexModelCatalog({ force: true });
    return apiSuccess({ modelId, path: route, ...attachmentSupport({ model: catalog.models.find(model => model.id === modelId), catalog,
      transport: readAttachmentTransport({ root, stateRoot: resolvePrithaStateRoot(root) }), path: route as "initial" | "resume" }) });
  } catch (error) { return apiError(error); }
}
