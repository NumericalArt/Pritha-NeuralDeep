import { getControlCenterStatus } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getControlCenterStatus());
}
