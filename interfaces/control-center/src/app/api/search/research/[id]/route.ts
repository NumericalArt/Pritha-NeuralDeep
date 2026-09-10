import { NextResponse } from "next/server";
import {
  researchJobs,
  publicJob,
  operatorJob,
} from "@/lib/search/research-server";
import { searchFailure } from "@/lib/search/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const jobs = researchJobs();
    jobs.reconcile();
    return NextResponse.json({
      ok: true,
      job: publicJob(operatorJob((await context.params).id)),
    });
  } catch (e) {
    return NextResponse.json(searchFailure(e), { status: 404 });
  }
}
