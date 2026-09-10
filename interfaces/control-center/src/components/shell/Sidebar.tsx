"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Copy, ExternalLink, Link2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { desktopNavItems } from "@/lib/routes";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { ControlCenterStatus } from "@/lib/control-center/types";
import { PrithaLogoPlaceholder } from "@/components/primitives/PrithaLogoPlaceholder";
import { LanguageDropdown } from "@/components/primitives/LanguageDropdown";
import { useControlCenterStatus } from "./ControlCenterStatusProvider";

const CONTROL_CENTER_PRODUCT = "Control Center";

type AccessView = {
  mode: string;
  state: string;
  url: string;
  voiceUrl?: string;
  dot: "green" | "orange" | "red";
};

function formatUptime(seconds: number | undefined) {
  if (!seconds || seconds < 0) return "starting";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function voiceUrlForStatus(status: ControlCenterStatus | null) {
  if (!status) return undefined;
  if (status.access.tailscale === "ready" && status.access.tailscaleVoiceUrl) return status.access.tailscaleVoiceUrl;
  if (status.access.lan === "ready" && status.access.lanUrl) return `${status.access.lanUrl}/voice`;
  return `${status.access.localhost}/voice`;
}

function accessView(status: ControlCenterStatus | null): AccessView {
  if (!status) {
    return {
      mode: "Checking",
      state: "Loading",
      url: "Loading status...",
      dot: "orange",
    };
  }
  if (status.access.tailscale === "ready" && status.access.tailscaleUrl) {
    return {
      mode: "Tailscale",
      state: "Connected",
      url: status.access.tailscaleUrl,
      voiceUrl: voiceUrlForStatus(status),
      dot: "green",
    };
  }
  if (status.access.lan === "ready" && status.access.lanUrl) {
    return {
      mode: "LAN",
      state: "Connected",
      url: status.access.lanUrl,
      voiceUrl: voiceUrlForStatus(status),
      dot: "green",
    };
  }
  if (status.access.tailscale === "pending_auth" && status.access.tailscaleUrl) {
    return {
      mode: "Tailscale",
      state: "Needs serve",
      url: status.access.tailscaleUrl,
      voiceUrl: voiceUrlForStatus(status),
      dot: "orange",
    };
  }
  return {
    mode: "Localhost",
    state: "Local",
    url: status.access.localhost,
    voiceUrl: voiceUrlForStatus(status),
    dot: "orange",
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const { status } = useControlCenterStatus();
  const [accessOpen, setAccessOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const access = useMemo(() => accessView(status), [status]);
  const appVersion = status.app.version;

  async function copyVoiceUrl() {
    if (!access.voiceUrl) return;
    const ok = await copyTextToClipboard(access.voiceUrl);
    setCopyStatus(ok ? "copied" : "failed");
    window.setTimeout(() => setCopyStatus("idle"), 1400);
  }

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <PrithaLogoPlaceholder size={52} />
        <div>
          <div className="brand-title">Pritha</div>
          <div className="brand-subtitle">Control Center</div>
          <div className="brand-version">{appVersion}</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {desktopNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/agents" && pathname.startsWith(item.href));
          return (
            <Link href={item.href} className={`nav-item ${active ? "active" : ""}`} key={item.href}>
              <span className="nav-icon">
                <Icon size={20} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-language-field">
        <label htmlFor="sidebar-language">Interface language</label>
        <LanguageDropdown id="sidebar-language" ariaLabel="Sidebar interface language" />
      </div>

      <div className="access-card">
        <h2>Access</h2>
        <div className="access-status">
          <span className={`dot ${access.dot}`} />
          <span>{access.mode}</span>
          <span className={`connected-pill ${access.dot}`}>{access.state}</span>
        </div>
        <p title={access.url}>{access.url}</p>
        <button className="secondary-button" type="button" onClick={() => setAccessOpen(true)} disabled={!access.voiceUrl}>
          Voice Link
          <Link2 size={15} />
        </button>
      </div>

      <div className="sidebar-version">
        <div>
          {CONTROL_CENTER_PRODUCT} {appVersion}
        </div>
        <div className="developer-brand">By NumericalArt</div>
        <div>
          Uptime {formatUptime(status?.app.uptimeSeconds)} <span className={`dot ${status ? "green" : "orange"}`} />
        </div>
      </div>

      {accessOpen ? (
        <div className="access-modal-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? setAccessOpen(false) : undefined)}>
          <div className="access-modal" role="dialog" aria-modal="true" aria-label="Voice link">
            <div className="access-modal-header">
              <h2>Voice Link</h2>
              <button className="icon-button" type="button" aria-label="Close voice link" onClick={() => setAccessOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <p>{access.voiceUrl || "Voice URL unavailable"}</p>
            <div className="access-modal-actions">
              <button className="outline-button compact" type="button" onClick={() => void copyVoiceUrl()} disabled={!access.voiceUrl}>
                <Copy size={15} />
                {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy Failed" : "Copy"}
              </button>
              {access.voiceUrl ? (
                <a className="primary-action-button compact" href={access.voiceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  Open
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
