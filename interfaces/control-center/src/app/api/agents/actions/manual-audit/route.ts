import { runFleetManualAudit } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await runFleetManualAudit();
  return Response.json(result);
}
