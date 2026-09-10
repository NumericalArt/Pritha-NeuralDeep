import { getControlCenterDiagnostics } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getControlCenterDiagnostics());
}
