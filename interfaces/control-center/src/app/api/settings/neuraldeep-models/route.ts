import { NextResponse } from "next/server";
import { getNeuralDeepServiceCatalog } from "@/lib/settings/codex-model-catalog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getNeuralDeepServiceCatalog(), {
    headers: { "Cache-Control": "no-store" },
  });
}
