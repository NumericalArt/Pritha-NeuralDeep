import { Bot, Mic, Orbit } from "lucide-react";
import type { ComponentType } from "react";
import type { CapabilityStatus, ControlCenterStatus } from "@/lib/control-center/types";

type Segment = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  value: string;
  valueTone?: "ready" | "connected" | "warn" | "failed" | "off";
  dot?: "green" | "orange" | "red";
};

function capabilitySegment(status: CapabilityStatus | undefined, labels: Partial<Record<CapabilityStatus, string>> = {}) {
  if (!status) return { value: "Checking", valueTone: "off" as const };
  if (status === "ready") return { value: labels.ready || "Ready", valueTone: "ready" as const, dot: "green" as const };
  if (status === "manual_only") return { value: labels.manual_only || "Manual", valueTone: "warn" as const, dot: "orange" as const };
  if (status === "pending_auth") return { value: labels.pending_auth || "Needs setup", valueTone: "warn" as const, dot: "orange" as const };
  if (status === "failed") return { value: labels.failed || "Failed", valueTone: "failed" as const, dot: "red" as const };
  if (status === "disabled") return { value: labels.disabled || "Off", valueTone: "off" as const };
  if (status === "not_installed") return { value: labels.not_installed || "Not installed", valueTone: "warn" as const, dot: "orange" as const };
  if (status === "unavailable") return { value: labels.unavailable || "Unavailable", valueTone: "off" as const };
  return { value: labels.planned || "Planned", valueTone: "off" as const };
}

export function StatusStrip({
  status,
}: {
  status?: ControlCenterStatus;
}) {
  const pritha = capabilitySegment(status?.pritha.status, { failed: "Needs setup" });
  const codex = capabilitySegment(status?.voice.codexBridge ?? status?.capabilities.codex_bridge, { manual_only: "Manual" });
  const voice = capabilitySegment(status?.voice.realtime ?? status?.capabilities.voice_realtime, { pending_auth: "Needs key", ready: "Ready" });
  const proactivity = capabilitySegment(status?.proactivity.status ?? status?.capabilities.proactivity, {
    manual_only: "Manual",
    not_installed: "Off",
    planned: "Planned",
  });
  const segments: Segment[] = [
    { icon: Bot, title: "Pritha", ...pritha },
    { icon: Bot, title: "Codex", ...codex },
    { icon: Mic, title: "Voice", ...voice },
    { icon: Orbit, title: "Proactivity", ...proactivity },
  ];

  return (
    <div className="status-strip" aria-label="Pritha status">
      {segments.map((segment) => {
        const Icon = segment.icon;
        return (
          <div className="status-segment" key={`${segment.title}-${segment.value}`}>
            <span className="status-icon" data-color-role={segment.title.toLowerCase()}>
              <Icon size={18} />
            </span>
            <span>
              <span className="status-label">
                {segment.title}
                {segment.dot ? <span className={`dot ${segment.dot}`} /> : null}
              </span>
              <span className={`status-value ${segment.valueTone || ""}`}>{segment.value}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
