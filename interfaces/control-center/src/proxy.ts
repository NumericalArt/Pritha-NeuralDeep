import { NextRequest, NextResponse } from "next/server";
import { evaluateApiRequestGuard } from "@/lib/security/api-guard";

export function proxy(request: NextRequest) {
  const decision = evaluateApiRequestGuard({
    url: request.url,
    method: request.method,
    headers: request.headers,
  });

  if (decision.action === "deny") {
    return NextResponse.json({ ok: false, error: decision.error }, { status: 403 });
  }

  if (decision.requestHeaders) {
    return NextResponse.next({ request: { headers: decision.requestHeaders } });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
