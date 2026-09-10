import { MobileShell } from "./MobileShell";
import { Sidebar } from "./Sidebar";
import { PrithaRealtimeProvider } from "@/components/voice/usePrithaRealtime";
import { controlCenterStatusForClient, getControlCenterStatus } from "@/lib/control-center/server";
import { ControlCenterStatusProvider } from "./ControlCenterStatusProvider";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const initialStatus = controlCenterStatusForClient(await getControlCenterStatus());

  return (
    <PrithaRealtimeProvider>
      <ControlCenterStatusProvider initialStatus={initialStatus}>
        <div className="app-shell">
          <Sidebar />
          <div className="content-shell">
            <MobileShell />
            <main className="app-main">{children}</main>
          </div>
        </div>
      </ControlCenterStatusProvider>
    </PrithaRealtimeProvider>
  );
}
