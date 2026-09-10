import { NextResponse } from "next/server";
import {
  searchService,
  operatorContext,
  searchFailure,
  boundedBody,
} from "@/lib/search/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { credentialStatus } from "../../../../../../../scripts/search/provider.mjs";
export async function GET() {
  try {
    const status = searchService().getStatus(operatorContext());
    return NextResponse.json(
      {
        ok: true,
        ...status,
        credential: { ...status.credential, status: await credentialStatus() },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(searchFailure(e), { status: 503 });
  }
}
export async function PATCH(request: Request) {
  try {
    const { patch, expectedRevision } = await boundedBody(request);
    if (!patch || !Number.isSafeInteger(expectedRevision))
      return NextResponse.json(
        { ok: false, error: "invalid_request" },
        { status: 400 },
      );
    searchService().configure(patch, expectedRevision);
    return GET();
  } catch (e) {
    const result = searchFailure(e);
    return NextResponse.json(result, {
      status: result.error === "revision_conflict" ? 409 : 400,
    });
  }
}
