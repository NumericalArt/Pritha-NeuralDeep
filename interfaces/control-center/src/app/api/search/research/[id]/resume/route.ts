import { NextResponse } from "next/server";
import {
  researchJobs,
  wakeResearch,
  publicJob,
  operatorJob,
} from "@/lib/search/research-server";
import { searchFailure } from "@/lib/search/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const prior = operatorJob((await context.params).id);
    const job = researchJobs().resume(prior.id, prior.owner);
    await wakeResearch();
    return NextResponse.json({ ok: true, job: publicJob(job) });
  } catch (e) {
    return NextResponse.json(searchFailure(e), { status: 400 });
  }
}
