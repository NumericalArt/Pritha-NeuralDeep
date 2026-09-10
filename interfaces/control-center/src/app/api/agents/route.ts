import { getControlCenterStatus } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getControlCenterStatus();
  return Response.json({
    ok: status.ok,
    generatedAt: status.generatedAt,
    capabilities: {
      agents_registry: status.capabilities.agents_registry,
      sibling_scan: status.capabilities.sibling_scan,
      operations_manifest: status.capabilities.operations_manifest,
      start_stop: status.capabilities.start_stop,
      restore: status.capabilities.restore,
      snapshots: status.capabilities.snapshots,
      rollback: status.capabilities.rollback,
      update_suggestions: status.capabilities.update_suggestions,
    },
    counts: status.counts,
    agents: status.childAgents,
  });
}
