import { NextResponse } from "next/server";
import { getNeuralDeepUsageSummary, type NeuralDeepUsageRange } from "@/lib/settings/neuraldeep-usage-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("range") || "24h";
  if (!(["24h", "7d", "30d"] as string[]).includes(value)) {
    return NextResponse.json({ ok: false, error: "invalid_usage_range" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, usage: await getNeuralDeepUsageSummary(value as NeuralDeepUsageRange) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "neuraldeep_usage_unavailable" }, { status: 503 });
  }
}
