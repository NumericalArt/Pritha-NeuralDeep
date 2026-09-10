import { NextResponse } from "next/server";
import { listPrithaCodexTasks } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 5);
  const result = await listPrithaCodexTasks(limit);
  return NextResponse.json(result);
}
