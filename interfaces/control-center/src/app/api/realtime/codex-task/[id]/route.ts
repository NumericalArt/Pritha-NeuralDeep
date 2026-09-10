import { NextResponse } from "next/server";
import { getPrithaCodexTask } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPrithaCodexTask(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
