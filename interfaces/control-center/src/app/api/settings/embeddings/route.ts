import { NextResponse } from "next/server";
import { getNeuralDeepServiceCatalog } from "@/lib/settings/codex-model-catalog-server";
import {
  activateLocalEmbeddings,
  activateNeuralDeepEmbeddings,
  configureNeuralDeepEmbeddingModel,
  getEmbeddingsSettingsStatus,
  startNeuralDeepEmbeddingIndex,
} from "@/lib/settings/embeddings-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...getEmbeddingsSettingsStatus() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string; model?: string; confirmation?: string };
  try {
    if (body.action === "configure-neuraldeep") {
      const catalog = await getNeuralDeepServiceCatalog();
      if (!catalog.embeddings.some((model) => model.id === body.model)) {
        return NextResponse.json({ ok: false, error: "model_not_in_neuraldeep_embedding_catalog" }, { status: 400 });
      }
      await configureNeuralDeepEmbeddingModel(String(body.model || ""));
    } else if (body.action === "activate-local") {
      await activateLocalEmbeddings();
    } else if (body.action === "activate-neuraldeep") {
      await activateNeuralDeepEmbeddings();
    } else if (body.action === "start-neuraldeep-index") {
      if (body.confirmation !== "send-memory-to-neuraldeep-for-embedding") {
        return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
      }
      const catalog = await getNeuralDeepServiceCatalog();
      if (!catalog.embeddings.some((model) => model.id === body.model)) {
        return NextResponse.json({ ok: false, error: "model_not_in_neuraldeep_embedding_catalog" }, { status: 400 });
      }
      await configureNeuralDeepEmbeddingModel(String(body.model || ""));
      const indexing = startNeuralDeepEmbeddingIndex(String(body.model || ""));
      return NextResponse.json({ ok: true, ...getEmbeddingsSettingsStatus(), indexing });
    } else {
      return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...getEmbeddingsSettingsStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "embeddings_settings_failed";
    return NextResponse.json({ ok: false, error: message }, { status: message.endsWith("_incomplete") ? 409 : 400 });
  }
}
