import { ExternalLink } from "lucide-react";
import type { ControlCenterStatus } from "@/lib/control-center/types";
import { StatusStrip } from "./StatusStrip";

type PageHeaderProps = {
  title: string;
  subtitle: string;
  count?: number;
  variant?: "agents" | "voice" | "dev";
  showCodexButton?: boolean;
  showCountPill?: boolean;
  status?: ControlCenterStatus;
};

export function PageHeader({
  title,
  subtitle,
  count,
  showCodexButton = false,
  showCountPill = true,
  status,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {showCountPill && typeof count === "number" ? <span className="count-pill">{count}</span> : null}
        </div>
        <p className="page-kicker">{subtitle}</p>
      </div>
      <div className="header-actions">
        <StatusStrip status={status} />
        {showCodexButton ? (
          <button className="open-codex-button" type="button">
            Open in Codex
            <ExternalLink size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
