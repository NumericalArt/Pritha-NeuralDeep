import { DeveloperPage } from "@/components/dev/DeveloperPage";
import { getControlCenterDiagnostics } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export default async function DevPage() {
  const diagnostics = await getControlCenterDiagnostics();
  return <DeveloperPage data={diagnostics} />;
}
