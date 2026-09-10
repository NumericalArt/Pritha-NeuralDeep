import { maintenanceResponse } from "@/lib/control-center/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(maintenanceResponse(["scripts/pritha-maintenance.mjs", "status", "--json", "--no-fetch"]));
}
