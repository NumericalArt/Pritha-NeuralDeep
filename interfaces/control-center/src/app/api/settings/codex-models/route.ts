import { NextResponse } from "next/server";
import { getCodexModelCatalog } from "@/lib/settings/codex-model-catalog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getCodexModelCatalog();
  return NextResponse.json(catalog, {
    headers: { "Cache-Control": "no-store" },
  });
}
