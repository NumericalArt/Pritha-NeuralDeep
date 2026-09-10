import { getOperatorActivity } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 12);
  const activity = await getOperatorActivity(Number.isFinite(limit) ? limit : 12);

  return Response.json(activity);
}
