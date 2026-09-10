import { NextResponse } from "next/server";
import { wakeResearch } from "@/lib/search/research-server";
import { boundedBody } from "@/lib/search/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await boundedBody(request).catch(() => null);
  if (!body?.instance || body.instance !== process.env.PRITHA_INSTANCE_ID)
    return NextResponse.json(
      { ok: false, error: "instance_mismatch" },
      { status: 403 },
    );
  await wakeResearch();
  return NextResponse.json({ ok: true });
}
