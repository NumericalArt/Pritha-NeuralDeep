import { NextResponse } from "next/server";
import {
  researchJobs,
  wakeResearch,
  publicJob,
  operatorJobs,
} from "@/lib/search/research-server";
import { boundedBody, searchFailure } from "@/lib/search/server";
import { getPrithaRuntimeSettings } from "@/lib/realtime/pritha-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json({ ok: true, jobs: operatorJobs().map(publicJob) });
  } catch (e) {
    return NextResponse.json(searchFailure(e), { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    const body = await boundedBody(request);
    const job = researchJobs().create(
      {
        question: body.question,
        model: getPrithaRuntimeSettings().codexModel,
        requestKey: body.requestKey,
      },
      {
        owner: "operator",
        turn: body.requestKey,
        surface: "research",
        explicit: true,
      },
    );
    await wakeResearch();
    return NextResponse.json(
      { ok: true, job: publicJob(job) },
      { status: 202 },
    );
  } catch (e) {
    return NextResponse.json(searchFailure(e), { status: 400 });
  }
}
