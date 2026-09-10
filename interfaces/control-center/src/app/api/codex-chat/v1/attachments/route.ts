import { apiSuccess } from "@/lib/codex-chat/http";
import { ATTACHMENT_LIMITS } from "@/lib/codex-chat/attachment-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return apiSuccess({ limits: ATTACHMENT_LIMITS }); }
