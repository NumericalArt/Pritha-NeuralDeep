import { NextResponse } from "next/server";
import { getSettingsLimitsState } from "@/lib/settings/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, limits: await getSettingsLimitsState() });
}
