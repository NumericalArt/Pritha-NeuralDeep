import { NextResponse } from "next/server";
import {
  searchService,
  operatorContext,
  searchFailure,
  boundedBody,
} from "@/lib/search/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await boundedBody(request);
    if (!["quota", "search"].includes(body.kind))
      return NextResponse.json(
        { ok: false, error: "invalid_request" },
        { status: 400 },
      );
    const result = await searchService().diagnose(
      body,
      operatorContext(`diagnostic:${crypto.randomUUID()}`),
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(searchFailure(e), { status: 503 });
  }
}
