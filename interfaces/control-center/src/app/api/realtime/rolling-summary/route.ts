import { NextResponse } from "next/server";
import { getPrithaRollingSummary, upsertPrithaRollingSummary } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await getPrithaRollingSummary({
    topic_key: url.searchParams.get("topic_key"),
    query: url.searchParams.get("query"),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await upsertPrithaRollingSummary(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
